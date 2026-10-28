const FETCH_TIMEOUT_MS = 45000

const els = {
  gameList: document.getElementById('game-list'),
  gameCount: document.getElementById('game-count'),
  gameSearch: document.getElementById('game-search'),
  detailPanel: document.querySelector('.detail-panel'),
  overlay: document.getElementById('loading-overlay'),
  empty: document.getElementById('empty-state'),
  loading: document.getElementById('loading-state'),
  error: document.getElementById('error-state'),
  errorMessage: document.getElementById('error-message'),
  retryBtn: document.getElementById('retry-btn'),
  packView: document.getElementById('pack-view'),
  gameIcon: document.getElementById('game-icon'),
  gameName: document.getElementById('game-name'),
  gameMeta: document.getElementById('game-meta'),
  summary: document.getElementById('summary'),
  notes: document.getElementById('notes'),
  sources: document.getElementById('sources'),
  categories: document.getElementById('categories')
}

let selectedSlug = null
let abortController = null
let loadSeq = 0
let allGames = []

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function filterGames(games, query) {
  const q = normalizeSearch(query)
  if (!q) return games
  return games.filter((game) => {
    const haystack = [game.name, game.slug, game.provider]
      .map(normalizeSearch)
      .join(' ')
    return haystack.includes(q)
  })
}

function renderGameList(games) {
  const filtered = filterGames(games, els.gameSearch.value)
  const total = games.length
  els.gameCount.textContent =
    filtered.length === total
      ? `${total} เกม`
      : `${filtered.length} / ${total} เกม`

  if (!filtered.length) {
    els.gameList.innerHTML =
      '<li class="game-list-empty">ไม่พบเกมที่ตรงกับคำค้นหา</li>'
    return
  }

  els.gameList.innerHTML = filtered
    .map(
      (game) => `<li>
        <button type="button" data-slug="${escapeHtml(game.slug)}"${
          game.slug === selectedSlug ? ' class="active"' : ''
        }>
          <span class="name">${escapeHtml(game.name)}</span>
          <span class="slug">${escapeHtml(game.slug)} · ${escapeHtml(game.provider)}</span>
        </button>
      </li>`
    )
    .join('')
}

function setBusy(isBusy, { keepContent = false } = {}) {
  els.detailPanel?.classList.toggle('is-loading', isBusy && keepContent)
  els.overlay?.classList.toggle('hidden', !(isBusy && keepContent))
  if (els.overlay) els.overlay.setAttribute('aria-hidden', isBusy && keepContent ? 'false' : 'true')
}

function showState(name) {
  els.empty.classList.toggle('hidden', name !== 'empty')
  els.loading.classList.toggle('hidden', name !== 'loading')
  els.error.classList.toggle('hidden', name !== 'error')
  els.packView.classList.toggle('hidden', name !== 'packs')
  if (name !== 'loading') setBusy(false)
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—'
  }
  return Number(value).toLocaleString('th-TH')
}

function formatMoney(value, currency) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—'
  }
  const amount = Number(value).toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2
  })
  return currency ? `${amount} ${currency}` : amount
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function packPriceParts(pack) {
  const thb =
    pack.price_thb ??
    pack.prices?.THB ??
    (pack.currency === 'THB' ? pack.price : null)
  const usd =
    pack.price_usd !== undefined
      ? pack.price_usd
      : (pack.prices?.USD ?? (pack.currency === 'USD' ? pack.price : null))
  const other =
    pack.store_price != null && pack.store_currency && pack.store_currency !== 'THB' && pack.store_currency !== 'USD'
      ? { amount: pack.store_price, currency: pack.store_currency }
      : pack.price != null && pack.currency && pack.currency !== 'THB' && pack.currency !== 'USD'
        ? { amount: pack.price, currency: pack.currency }
        : null

  return { thb, usd, other }
}

function renderSources(source, sources) {
  const lines = []
  if (typeof source === 'string' && source) {
    lines.push(`<div>แหล่งหลัก: ${linkOrText(source)}</div>`)
  }
  if (Array.isArray(sources)) {
    for (const s of sources) {
      const label = [s.role, s.currency].filter(Boolean).join(' · ')
      lines.push(
        `<div>${escapeHtml(label || s.id || 'source')}: ${linkOrText(s.url || '')}</div>`
      )
    }
  } else if (sources && typeof sources === 'object') {
    if (sources.thb) lines.push(`<div>THB: ${linkOrText(sources.thb)}</div>`)
    if (sources.usd) lines.push(`<div>USD: ${linkOrText(sources.usd)}</div>`)
  }
  if (!lines.length) {
    els.sources.classList.add('hidden')
    els.sources.innerHTML = ''
    return
  }
  els.sources.classList.remove('hidden')
  els.sources.innerHTML = lines.join('')
}

function linkOrText(value) {
  if (!value) return '—'
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
  }
  return escapeHtml(value)
}

function renderPackRow(pack) {
  const { thb, usd, other } = packPriceParts(pack)
  const priceHtml = [
    `<span class="price-main" title="${escapeHtml(thb == null ? pack.price_thb_null_reason ?? '' : '')}">${escapeHtml(formatMoney(thb, 'THB'))}</span>`,
    usd !== null && usd !== undefined
      ? `<span class="price-sub">${escapeHtml(formatMoney(usd, 'USD'))}</span>`
      : pack.price_usd_null_reason
        ? `<span class="price-sub" title="${escapeHtml(pack.price_usd_null_reason)}">USD —</span>`
        : '',
    other
      ? `<span class="price-sub">${escapeHtml(formatMoney(other.amount, other.currency))}</span>`
      : ''
  ].join('')

  // Display like "5,000 + 580 (5,580)"; bonus null = official bonus source unavailable (never guessed).
  const amounts =
    pack.item_pack === true || pack.baseItemAmount == null
      ? '—'
      : pack.bonusItemAmount == null || pack.bonus_available === false
      ? `${formatNumber(pack.baseItemAmount)} + ? (bonus unavailable)`
      : Number(pack.bonusItemAmount) > 0
        ? `${formatNumber(pack.baseItemAmount)} + ${formatNumber(pack.bonusItemAmount)} (${formatNumber(pack.totalItemAmount)})`
        : formatNumber(pack.totalItemAmount ?? pack.baseItemAmount)

  // Amount unknown (not item pack): show the official null reason instead of a bare dash.
  const amountReason =
    pack.item_pack !== true && pack.baseItemAmount == null && pack.base_null_reason
      ? `<div class="meta">${escapeHtml(pack.base_null_reason)}</div>`
      : ''

  const issues =
    Array.isArray(pack.issues) && pack.issues.length
      ? `<div class="issues">${escapeHtml(pack.issues.join(' · '))}</div>`
      : ''

  const descText = [pack.description ?? pack.goods_desc ?? pack.contents ?? '', Array.isArray(pack.extras) && pack.extras.length ? pack.extras.join(', ') : '', pack.first_purchase_bonus > 0 ? 'First purchase bonus +' + formatNumber(pack.first_purchase_bonus) : ''].filter(Boolean).join(' · ')
  const desc = descText ? `<div class="meta">${escapeHtml(descText)}</div>` : ''

  const sources = [
    pack.price_thb_source ? `THB: ${pack.price_thb_source}` : null,
    pack.price_usd_source ? `USD: ${pack.price_usd_source}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  return `<tr>
    <td>
      <strong>${escapeHtml(pack.name ?? '—')}</strong>
      ${pack.name_th && pack.name_th !== pack.name ? `<div class="meta">${escapeHtml(pack.name_th)}</div>` : ''}
      <div class="meta">ID ${escapeHtml(pack.id ?? '—')}</div>
      ${desc}
      ${issues}
    </td>
    <td class="num">${escapeHtml(amounts)}${amountReason}</td>
    <td class="num">${priceHtml}</td>
    <td class="meta">${escapeHtml(sources || '—')}</td>
  </tr>`
}

function renderCategories(categories) {
  if (!Array.isArray(categories) || !categories.length) {
    els.categories.innerHTML = '<p class="meta">ไม่พบแพ็คในเกมนี้</p>'
    return
  }

  els.categories.innerHTML = categories
    .map((cat) => {
      const packs = Array.isArray(cat.packs) ? cat.packs : []
      const rows = packs.map(renderPackRow).join('')
      const status =
        cat.message || cat.status != null
          ? `<span class="count">${escapeHtml(
              [cat.status != null ? `status ${cat.status}` : null, cat.message]
                .filter(Boolean)
                .join(' · ')
            )}</span>`
          : ''
      return `<section class="category">
        <h3>
          <span>${escapeHtml(cat.name ?? `หมวด ${cat.id}`)}</span>
          <span class="count">${packs.length} แพ็ค</span>
          ${status}
        </h3>
        <div class="pack-table-wrap">
          <table class="packs">
            <thead>
              <tr>
                <th>แพ็ค</th>
                <th>base + bonus (total)</th>
                <th>ราคา</th>
                <th>แหล่งราคา</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" class="meta">ไม่มีแพ็ค</td></tr>'}</tbody>
          </table>
        </div>
      </section>`
    })
    .join('')
}

function renderPacks(data) {
  const game = data.game ?? {}
  els.gameName.textContent = game.name || selectedSlug
  els.gameMeta.textContent = [
    game.slug ? `slug: ${game.slug}` : null,
    game.itemName ? `ไอเท็ม: ${game.itemName}` : null,
    data.fetchedAt ? `อัปเดต: ${new Date(data.fetchedAt).toLocaleString('th-TH')}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  if (game.itemIcon) {
    els.gameIcon.src = game.itemIcon
    els.gameIcon.alt = game.itemName || game.name || ''
    els.gameIcon.classList.remove('hidden')
  } else {
    els.gameIcon.removeAttribute('src')
    els.gameIcon.classList.add('hidden')
  }

  const summary = data.summary ?? {}
  els.summary.innerHTML = `
    <div><dt>หมวด</dt><dd>${escapeHtml(formatNumber(summary.categoryCount))}</dd></div>
    <div><dt>แพ็คทั้งหมด</dt><dd>${escapeHtml(formatNumber(summary.packCount))}</dd></div>
    <div><dt>หมวดที่โหลด</dt><dd>${escapeHtml(formatNumber((data.categories || []).length))}</dd></div>
  `

  if (Array.isArray(data.notes) && data.notes.length) {
    els.notes.classList.remove('hidden')
    els.notes.innerHTML = data.notes.map((n) => `<div>${escapeHtml(n)}</div>`).join('')
  } else {
    els.notes.classList.add('hidden')
    els.notes.innerHTML = ''
  }

  renderSources(data.source, data.sources)
  renderCategories(data.categories)
  showState('packs')
}

function gameFromUrl() {
  return new URL(window.location.href).searchParams.get('game')
}

function syncGameInUrl(slug, { push = false } = {}) {
  const url = new URL(window.location.href)
  if (slug) url.searchParams.set('game', slug)
  else url.searchParams.delete('game')
  const next = `${url.pathname}${url.search}${url.hash}`
  if (push) history.pushState({ game: slug }, '', next)
  else history.replaceState({ game: slug }, '', next)
}

async function loadGames() {
  const res = await fetch('/games/')
  if (!res.ok) throw new Error(`โหลดรายชื่อเกมไม่สำเร็จ (${res.status})`)
  const data = await res.json()
  allGames = data.games || []
  renderGameList(allGames)
}

async function loadPacks(slug, { pushUrl = false, syncUrl = true } = {}) {
  const seq = ++loadSeq
  selectedSlug = slug
  if (syncUrl) syncGameInUrl(slug, { push: pushUrl })

  for (const btn of els.gameList.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.slug === slug)
  }

  if (abortController) abortController.abort()
  const controller = new AbortController()
  abortController = controller

  const keepContent = !els.packView.classList.contains('hidden')
  if (keepContent) {
    setBusy(true, { keepContent: true })
  } else {
    showState('loading')
  }

  const timer = setTimeout(() => {
    controller.abort('timeout')
  }, FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(`/games/${encodeURIComponent(slug)}/packs/`, {
      signal: controller.signal
    })
    if (seq !== loadSeq) return

    const data = await res.json().catch(() => ({}))
    if (seq !== loadSeq) return

    if (!res.ok) {
      throw new Error(data.error || `โหลดแพ็คไม่สำเร็จ (${res.status})`)
    }
    setBusy(false)
    renderPacks(data)
  } catch (err) {
    if (seq !== loadSeq) return
    if (err.name === 'AbortError') {
      const timedOut =
        controller.signal.reason === 'timeout' ||
        String(controller.signal.reason || '').includes('timeout')
      if (!timedOut) return
      els.errorMessage.textContent =
        'โหลดนานเกินไป (เกิน 45 วินาที) — ลองอีกครั้งหรือเลือกเกมอื่น'
      setBusy(false)
      showState('error')
      return
    }
    els.errorMessage.textContent = err.message || 'โหลดไม่สำเร็จ'
    setBusy(false)
    showState('error')
  } finally {
    clearTimeout(timer)
  }
}

function clearSelection({ syncUrl = true } = {}) {
  selectedSlug = null
  if (syncUrl) syncGameInUrl(null)
  renderGameList(allGames)
  showState('empty')
}

els.gameList.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-slug]')
  if (!btn) return
  loadPacks(btn.dataset.slug, { pushUrl: true })
})

els.gameSearch.addEventListener('input', () => {
  renderGameList(allGames)
})

els.retryBtn.addEventListener('click', () => {
  if (selectedSlug) loadPacks(selectedSlug, { syncUrl: false })
})

window.addEventListener('popstate', () => {
  const slug = gameFromUrl()
  if (!slug) {
    clearSelection({ syncUrl: false })
    return
  }
  loadPacks(slug, { syncUrl: false })
})

async function boot() {
  try {
    await loadGames()
    const fromUrl = gameFromUrl()
    if (!fromUrl) return
    const known = allGames.some((game) => game.slug === fromUrl)
    if (known) {
      await loadPacks(fromUrl, { syncUrl: false })
    } else {
      syncGameInUrl(null)
    }
  } catch (err) {
    els.gameCount.textContent = 'ผิดพลาด'
    els.gameList.innerHTML = `<li class="game-list-empty">${escapeHtml(err.message)}</li>`
  }
}

boot()
