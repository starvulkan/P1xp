import { paint } from './teams.js'

export function mount({ listEl }) {
    const audio = new Audio()
    let playingUrl = null
    let rendered = ''

    audio.addEventListener('ended', () => { playingUrl = null; mark() })
    audio.addEventListener('error', () => { playingUrl = null; mark() })

    function mark() {
        for (const item of listEl.children) {
            item.classList.toggle('radio__item--playing', item.dataset.url === playingUrl)
        }
    }

    function toggle(url) {
        if (playingUrl === url) {
            audio.pause()
            playingUrl = null
        } else {
            audio.src = url
            audio.play().catch((error) => {
                console.warn('radio: playback blocked', url, error)
                playingUrl = null
                mark()
                const item = [...listEl.children].find((el) => el.dataset.url === url)
                if (item) item.classList.add('radio__item--failed')
            })
            playingUrl = url 
        }
        mark()
    }

    return function render(state, favourite) {
        const clips = state.radio || []
        const signature = clips.map((c) => c.recording_url).join('|')
        if (signature === rendered) return
        rendered = signature

        listEl.textContent = ''
        for (const clip of clips) {
            const driver = state.drivers[clip.driver_number]
            const item = document.createElement('li')
            item.className = 'radio__item'
            item.dataset.url = clip.recording_url
            if (String(clip.driver_number) === String(favourite)) item.classList.add('radio__item--fav')
            
            const { fill, ink } = paint(driver ? driver.colour : '')
            item.style.setProperty('--dot', fill)
            item.style.setProperty('--dot-ink', ink)
            
            const button = document.createElement('button')
            button.className = 'radio__play'
            button.type = 'button'
            button.textContent = '\u25B6'
            button.setAttribute('aria-label', `Play team radio for ${driver ? driver.abbr : clip.driver_number}`)
            button.addEventListener('click', () => toggle(clip.recording_url))

            item.append(
                button,
                Object.assign(document.createElement('span'), {
                    className: 'radio__who', textContent: driver ? driver.abbr : String(clip.driver_number),
                }),
                Object.assign(document.createElement('span'), {
                    className: 'radio__time',
                    textContent: new Date(clip.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }),
            )
            listEl.append(item)
        }
        mark()
    }
}