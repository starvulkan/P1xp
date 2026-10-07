const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
    if (context.electronPlatformName !== 'darwin') return

    const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
    console.log(`  • ad-hoc signing ${app}`)

    try {
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
    } catch (error) {
        console.warn('  • ad-hoc signing failed, the app may not launch on Apple Silicon')
        throw error
    }
}