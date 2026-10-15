"""LAN-only STUN binding discovery; never relays file bytes or exposes Agent APIs."""
import asyncio
import ipaddress
import struct
import time

from app.services.lan_share import SHARE_PORT, _candidate_ips

PRIVATE = tuple(ipaddress.ip_network(n) for n in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))
transports = {}


def private_ipv4(value):
    try:
        ip = ipaddress.ip_address(value)
        return ip.version == 4 and any(ip in network for network in PRIVATE)
    except ValueError:
        return False


def binding_response(packet, ip, port):
    if not private_ipv4(ip) or not 20 <= len(packet) <= 512:
        return None
    kind, length, cookie = struct.unpack('!HHI', packet[:8])
    if kind != 1 or cookie != 0x2112A442 or length != len(packet) - 20 or length % 4:
        return None
    # Only the requester's address is returned; arbitrary destinations are impossible.
    attribute = struct.pack('!HHBBHI', 0x0020, 8, 0, 1, port ^ 0x2112, int(ipaddress.ip_address(ip)) ^ cookie)
    return struct.pack('!HHI', 0x0101, len(attribute), cookie) + packet[8:20] + attribute


class BindingProtocol(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        self.transport = transport
        self.window, self.count = time.monotonic(), 0

    def datagram_received(self, packet, addr):
        if time.monotonic() - self.window >= 1:
            self.window, self.count = time.monotonic(), 0
        if self.count >= 30:
            return
        response = binding_response(packet, addr[0], addr[1])
        if response:
            self.count += 1
            self.transport.sendto(response, addr)


async def refresh_bindings():
    ips = {ip for ip in await asyncio.to_thread(_candidate_ips, physical_only=True) if private_ipv4(ip)}
    for ip in list(transports):
        if ip not in ips:
            transports.pop(ip).close()
    for ip in ips - transports.keys():
        try:
            transport, _ = await asyncio.get_running_loop().create_datagram_endpoint(BindingProtocol, local_addr=(ip, SHARE_PORT))
            transports[ip] = transport
        except OSError:
            pass  # Old LAN HTTP and cloud sharing remain usable if UDP is unavailable.


async def maintain_bindings():
    try:
        while True:
            await refresh_bindings()
            await asyncio.sleep(30)
    finally:
        for transport in transports.values():
            transport.close()
        transports.clear()


def urls():
    return [f'stun:{ip}:{SHARE_PORT}' for ip in sorted(transports)]
