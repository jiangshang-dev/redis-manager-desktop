const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const pngToIco = require('png-to-ico').default

const root = path.join(__dirname, '..')
const src = path.join(root, 'build', 'icon.png')
const outIco = path.join(root, 'build', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const tmpDir = path.join('/tmp', 'redis-manager-icons')

if (!fs.existsSync(src)) {
  console.error('missing build/icon.png')
  process.exit(1)
}

fs.mkdirSync(tmpDir, { recursive: true })
const files = sizes.map((size) => {
  const file = path.join(tmpDir, `icon-${size}.png`)
  execFileSync('sips', ['-z', String(size), String(size), src, '--out', file], {
    stdio: 'ignore'
  })
  return file
})

pngToIco(files).then((buf) => {
  fs.writeFileSync(outIco, buf)
  fs.copyFileSync(outIco, path.join(root, 'resources', 'icon.ico'))
  console.log('generated', outIco)
})
