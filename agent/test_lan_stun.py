import struct
import unittest
from unittest.mock import Mock, patch

from app.services.lan_stun import BindingProtocol, binding_response, private_ipv4
from app.services.lan_share import _candidate_ips


class LanStunTests(unittest.TestCase):
    def setUp(self):
        self.request = struct.pack('!HHI', 1, 0, 0x2112A442) + b'123456789012'

    def test_binding_only_returns_requester(self):
        response = binding_response(self.request, '192.168.1.8', 50000)
        self.assertEqual(response[8:20], self.request[8:20])
        self.assertEqual(struct.unpack('!H', response[26:28])[0] ^ 0x2112, 50000)
        self.assertEqual(struct.unpack('!I', response[28:])[0] ^ 0x2112A442, 0xc0a80108)
        self.assertEqual(len(response), 32)

    def test_reject_public_virtual_and_malformed(self):
        for ip in ('8.8.8.8', '127.0.0.1', '198.18.0.1', '100.64.0.1', '::1', 'bad'):
            self.assertFalse(private_ipv4(ip))
            self.assertIsNone(binding_response(self.request, ip, 50000))
        for packet in (b'', self.request + b'x', b'\x01\x01' + self.request[2:], self.request[:4] + b'bad!' + self.request[8:]):
            self.assertIsNone(binding_response(packet, '192.168.1.8', 50000))

    def test_rate_limit(self):
        protocol, transport = BindingProtocol(), Mock()
        protocol.connection_made(transport)
        for _ in range(40):
            protocol.datagram_received(self.request, ('192.168.1.8', 50000))
        self.assertEqual(transport.sendto.call_count, 30)

    def test_mac_physical_discovery_excludes_vpn_and_route_fallback(self):
        interfaces = 'en1: flags=8863<UP,BROADCAST,RUNNING>\n\tinet 192.168.1.8 netmask 0xffffff00\nutun0: flags=8051<UP,POINTOPOINT>\n\tinet 10.8.0.2 netmask 0xffffffff\n'
        with patch('app.services.lan_share.sys.platform', 'darwin'), patch('app.services.lan_share.subprocess.run', return_value=Mock(stdout=interfaces)), patch('app.services.lan_share._default_lan_ip', return_value='10.8.0.2'):
            self.assertEqual(_candidate_ips(physical_only=True), ['192.168.1.8'])


if __name__ == '__main__':
    unittest.main()
