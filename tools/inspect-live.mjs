import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import zlib from 'node:zlib'

const FILE = process.argv[2]
if (!FILE) throw new Error('usage: node tools/inspect-live.mjs <recording.jsonl>')

const RS = '\u001e'
const counts = new Map()
const samples = new Map()
let frames = 0
let bytes = 0
let first = null
let last = null

function decode(topic, data) {
    if (!topic.endsWith('.z')) return { topic, data }
    const raw = zlib.inflateRawSync(Buffer.from(data, 'base64')).toString('utf8')
    return { topic: topic.slice(0, -2), data: JSON.parse(raw.replace(/^\uFEFF/, '')) }
}

function note(topic, data) {
    counts.set(topic, (counts.get(topic) || 0) + 1)
    if (!samples.has(topic)) samples.set(topic, data)
}

const lines = createInterface({ input: createReadStream(FILE), crlfDelay: Infinity })
for await (const line of lines) {
    if (!line.trim()) continue
    bytes += line.length
    let entry
    try { entry = JSON.parse(line) } catch { continue }
    first = first ?? entry.t
    last = entry.t
    for (const chunk of String(entry.raw).split(RS)) {
        if (!chunk) continue
        let message
        try { message = JSON.parse(chunk) } catch { continue }
        frames++
        if (message.type === 3 && message.result) {
            for (const [topic, data] of Object.entries(message.result)) {
                try { const row = decode(topic, data); note('INITIAL:' + row.topic, row.data) } catch { note('INITIAL:' + topic + ' (undecodable)', null) }
            }
        }
        if (message.type === 1 && message.target === 'feed') {
            const [topic, data] = message.arguments || []
            if (!topic) continue
            try { const row = decode(topic, data); note(row.topic, row.data) } catch { note(topic + ' (undecodable)', null) }
        }
    }
}

const mins = first && last ? ((last - first) / 60000).toFixed(1) : '0'
console.log(`${FILE}\n${(bytes / 1048576).toFixed(2)} MB, ${frames} frames, ${mins} min\n`)
for (const [topic, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(n).padStart(6)} ${topic}`)
}
console.log('\n--- first sample of each topic ---')
for (const [topic, data] of samples) {
    const text = JSON.stringify(data)
    console.log(`\n${topic}:\n${text && text.length > 600 ? text.slice(0, 600) + ' …' : text}`)
}