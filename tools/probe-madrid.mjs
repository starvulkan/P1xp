// is madrid in multiviewer under some other key?

const MV = 'https://api.multiviewer.app/api/v1/circuits'
const UA = { 'User-Agent': 'P1XP/0.2.0' }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function look(key, year) {
    try {
        const response = await fetch(`${MV}/${key}/${year}`, { headers: UA, signal: AbortSignal.timeout(15_000) })
        if (!response.ok) return response.status
        const data = await response.json()
        return { key: data.circuitKey, name: data.circuitName, where: data.location, country: data.countryName }
    } catch (error) {
        return error.message
    }
}

console.log('control, singapore 61:', JSON.stringify(await look(61, 2026)))

console.log('\n--- key 153 across years ---')
for (const year of [2024, 2025, 2026, 2027]) {
    console.log(` 153/${year}:`, JSON.stringify(await look(153, year)))
    await sleep(300)
}

console.log('\n--- scanning keys 140-200 for 2026 ---')
for (let key = 140; key <= 200; key++) {
    const hit = await look(key, 2026)
    if (typeof hit === 'object') console.log(` ${String(key).padStart(3)}: ${hit.name} \u2502 ${hit.where} \u2502 ${hit.country}`)
    await sleep(250)
}