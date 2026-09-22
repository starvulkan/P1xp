/* sets tracks for images! */
const BY_CIRCUIT = {
    'sakhir': 'bahrain',
    'jeddah': 'saudi-arabia',
    'melbourne': 'australia',
    'albert park': 'australia',
    'suzuka': 'japan',
    'shanghai': 'china',
    'miami': 'miami',
    'imola': 'emilia-romagna',
    'monaco': 'monaco',
    'montreal': 'canada',
    'gilles villeneuve': 'canada',
    'catalunya': 'barcelona',
    'barcelona': 'barcelona',
    'madrid': 'madrid',
    'madring': 'madrid',
    'spielberg': 'austria',
    'red bull ring': 'austria',
    'silverstone': 'britain',
    'hungaroring': 'hungary',
    'spa': 'belgium',
    'zandvoort': 'netherlands',
    'monza': 'italy',
    'baku': 'azerbaijan',
    'singapore': 'singapore',
    'marina bay': 'singapore',
    'austin': 'united-states',
    'cota': 'united-states',
    'americas': 'united-states',
    'mexico': 'mexico',
    'interlagos': 'brazil',
    'sao paulo': 'brazil',
    'las vegas': 'las-vegas',
    'lusail': 'qatar',
    'losail': 'qatar',
    'yas marina': 'abu-dhabi',
    'sepang': 'malaysia',
    'portimao': 'portugal',
    'algarve': 'portugal',
    'istanbul': 'turkiye', 
}

const BY_COUNTRY = {
    'bahrain': 'bahrain',
    'saudi arabia': 'saudi-arabia',
    'australia': 'australia',
    'japan': 'japan',
    'china': 'china',
    'italy': 'italy',
    'monaco': 'monaco',
    'canada': 'canada',
    'spain': 'barcelona',
    'austria': 'austria',
    'united kingdom': 'britain',
    'great britain': 'britain',
    'hungary': 'hungary',
    'belgium': 'belgium',
    'netherlands': 'netherlands',
    'azerbaijan': 'azerbaijan',
    'singapore': 'singapore',
    'united states': 'united-states',
    'mexico': 'mexico',
    'brazil': 'brazil',
    'qatar': 'qatar',
    'united arab emirates': 'abu-dhabi',
    'malaysia': 'malaysia',
    'portugal': 'portugal',
    'turkey': 'turkiye',
    'turkiye': 'turkiye',
}

function plain(value) {
    return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function slugFor(session) {
    if (!session) return null
    const circuit = plain(session.circuit)
    for (const [needle, slug] of Object.entries(BY_CIRCUIT)) {
        if (circuit.includes(needle)) return slug
    }
    return BY_COUNTRY[plain(session.country)] || null
}

export function urlFor(session) {
    const slug = slugFor(session)
    return slug ? `./tracks/${slug}.webp` : null
}

function preload(src, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const img = new Image()
        const timer = setTimeout(() => resolve(false), timeoutMs)
        img.onload = () => { clearTimeout(timer); resolve(true) }
        img.onerror = () => { clearTimeout(timer); resolve(false) }
        img.src = src
    })
}

export function mount({ photoEl, scrimEl }) {
    let showing = null

    function hide() {
        showing = null
        photoEl.hidden = true
        scrimEl.hidden = true
        photoEl.style.backgroundImage = ''
    }

    return async function apply(session) {
        const url = urlFor(session)
        if (!url) { hide(); return null }
        if (url === showing) return showing

        if (!(await preload(url))) { hide(); return null }

        photoEl.style.backgroundImage = `url(${JSON.stringify(url)})`
        photoEl.hidden = false
        scrimEl.hidden = false
        showing = url
        return url
    }
}