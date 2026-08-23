const downloads = {
  mac: 'https://myagentscope.oss-cn-beijing.aliyuncs.com/Redis%20Manager-1.0.0-arm64.dmg',
  windows: 'https://myagentscope.oss-cn-beijing.aliyuncs.com/Redis%20Manager%20Setup%201.0.0.exe'
}

function detectPlatform() {
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const isMac = /Mac|Macintosh|MacIntel|MacPPC/i.test(platform) || /Mac OS X/i.test(ua)
  const isWin = /Win/i.test(platform) || /Windows/i.test(ua)

  if (isWin) {
    return {
      label: 'Windows x64 · v1.0.0',
      href: downloads.windows,
      button: '下载 Windows 安装包'
    }
  }

  if (isMac) {
    return {
      label: 'macOS Apple Silicon · v1.0.0',
      href: downloads.mac,
      button: '下载 macOS（Apple Silicon）'
    }
  }

  return {
    label: 'macOS Apple Silicon · v1.0.0',
    href: downloads.mac,
    button: '下载 macOS（Apple Silicon）'
  }
}

const primary = document.getElementById('primary-download')
const hint = document.getElementById('platform-hint')
const info = detectPlatform()

if (primary) {
  primary.href = info.href
  primary.textContent = info.button
}

if (hint) {
  hint.textContent = `当前推荐：${info.label}`
}
