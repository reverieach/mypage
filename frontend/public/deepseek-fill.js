(function fillDeepSeekPrompt() {
  const params = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const prompt =
    params.get('q') ||
    params.get('prompt') ||
    params.get('mypage_prompt') ||
    hashParams.get('q') ||
    hashParams.get('prompt') ||
    hashParams.get('mypage_prompt')

  if (!prompt) {
    return
  }

  let done = false

  function isVisible(element) {
    const rect = element.getBoundingClientRect()
    return rect.width > 80 && rect.height > 16 && rect.bottom > 0 && rect.top < window.innerHeight
  }

  function dispatchInput(element) {
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        data: prompt,
        inputType: 'insertText',
      }),
    )
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function setNativeValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    )

    if (descriptor?.set) {
      descriptor.set.call(element, value)
    } else {
      element.value = value
    }
  }

  function fillElement(element) {
    element.focus()

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      setNativeValue(element, prompt)
      dispatchInput(element)
      return true
    }

    if (element.isContentEditable) {
      element.textContent = prompt
      dispatchInput(element)
      return true
    }

    return false
  }

  function findPromptInput() {
    return [
      ...document.querySelectorAll(
        'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]',
      ),
    ]
      .filter((element) => !element.disabled && isVisible(element))
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]
  }

  function tryFill() {
    if (done) {
      return true
    }

    const input = findPromptInput()

    if (!input) {
      return false
    }

    done = fillElement(input)

    if (done) {
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    return done
  }

  if (tryFill()) {
    return
  }

  let attempts = 0
  const interval = window.setInterval(() => {
    attempts += 1

    if (tryFill() || attempts > 60) {
      window.clearInterval(interval)
    }
  }, 250)
})()
