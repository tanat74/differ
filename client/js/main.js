;(function () {
  const restoreDiff = (diff) => {
    const lines = diff.split('\n').slice(3)
    const [fileA, fileB] = [[], []]
    for (const line of lines) {
      const [op, content] = [line[0], line.slice(1)]
      if (op === ' ' || op === '-') {
        fileA.push(content)
      }
      if (op === ' ' || op === '+') {
        fileB.push(content)
      }
    }
    return [fileA.join('\n'), fileB.join('\n')]
  }

  const diffStats = (diff) => {
    const lines = diff.split('\n').slice(3)
    let added = 0,
      removed = 0
    for (const line of lines) {
      if (line[0] === '+') added++
      else if (line[0] === '-') removed++
    }
    return [added, removed]
  }

  const decode = (data) => {
    return new TextDecoder().decode(
      pako.inflate(buffer.Buffer.from(data, 'hex'))
    )
  }

  const $ = document.querySelector.bind(document),
    MODAL_ID = 'modal-1',
    VIEW_MODE_EDIT = 'edit',
    VIEW_MODE_DIFF = 'diff'

  function App() {
    const _app = this
    const _context = window._diffContext || {}

    this.ui = {
      // loader: $('#loader'),
      controls: $('form#main .controls'),
      compare: $('button.compare'),
      edit: $('button.edit'),
      save: $('button.save'),
      files: $('form#main .files'),
      fileA: $('#fileA'),
      fileB: $('#fileB'),
      form: $('form#main'),
      diff: $('.diff'),
      modalContent: $('#modal-1-content'),
      modalTitle: $('#modal-1-title'),
      title: $('input#title'),
      diffNav: $('.diff-nav'),
      diffNavFirst: $('.diff-nav-first'),
      diffNavPrev: $('.diff-nav-prev'),
      diffNavCounter: $('.diff-nav-counter'),
      diffNavNext: $('.diff-nav-next'),
      diffNavLast: $('.diff-nav-last'),
    }

    this.state = {
      id: _context.id || null,
      created: _context.created || null,
      title: _context.title || null,
      data: _context.data || null,
      diff: null,
      changeBlocks: [],
      currentBlockIndex: -1,
      isAutoScrolling: false,
      autoScrollTimer: null,
      scrollSyncRaf: 0,
    }

    function compareHandler() {
      try {
        _app.compare()
        _app.render()
        _app.toggleView(VIEW_MODE_DIFF)
        _app.scrollToFirstChangeOrTop()
      } catch (e) {
        _app.error(e.message)
      }
    }

    function lineNumHandler(e) {
      console.log(e)
      setTimeout(() => _app.updateLineNumbers(e.target), 10)
    }

    this.ui.compare.onclick = compareHandler

    this.ui.edit.onclick = function () {
      _app.restore()
      _app.toggleView(VIEW_MODE_EDIT)
    }

    this.ui.save.onclick = function (e) {
      _app.save()
    }

    this.ui.diffNavFirst.onclick = function () {
      _app.goToChangeBlock(0)
    }

    this.ui.diffNavPrev.onclick = function () {
      _app.goToChangeBlock(_app.state.currentBlockIndex - 1)
    }

    this.ui.diffNavNext.onclick = function () {
      _app.goToChangeBlock(_app.state.currentBlockIndex + 1)
    }

    this.ui.diffNavLast.onclick = function () {
      _app.goToChangeBlock(_app.state.changeBlocks.length - 1)
    }

    this.ui.form.onsubmit = function (e) {
      e.preventDefault()
      compareHandler()
    }

    window.addEventListener(
      'scroll',
      function () {
        _app.scheduleScrollSync()
      },
      { passive: true }
    )
  }

  App.prototype.compare = function () {
    const fileA = this.ui.fileA.value
    const fileB = this.ui.fileB.value

    if (fileA == fileB) {
      const msg = `Files are ${fileA ? 'equal' : 'empty'}`
      throw Error(msg)
    }
    this.state.diff = Diff.createTwoFilesPatch(
      'fileA',
      'fileB',
      fileA,
      fileB,
      'old',
      'new',
      {
        context: Infinity,
      }
    )
    this.state.data = buffer
      .Buffer(pako.deflate(this.state.diff))
      .toString('hex')
    this.state.title = this.ui.title.value
    this.state.created = null
  }

  App.prototype.render = function () {
    const configuration = {
      drawFileList: false,
      fileListToggle: false,
      fileListStartVisible: false,
      fileContentToggle: false,
      matching: 'words',
      outputFormat: 'side-by-side',
      synchronisedScroll: true,
      highlight: true,
      renderNothingWhenEmpty: true,
      stickyHeaders: false,
    }
    const diff2htmlUi = new Diff2HtmlUI(
      this.ui.diff,
      this.state.diff,
      configuration
    )
    diff2htmlUi.draw()
    diff2htmlUi.highlightCode()
    this.setDiffInfo()
    this.refreshDiffNavigation()
  }

  App.prototype.setDiffInfo = function () {
    const header = $('.d2h-file-header')
    const title = this.state.title || 'Название сравнения'
    let copyButton = false
    let html = `<div class="diff-info">`

    if (this.state.title) {
      html += `<div>Name: <strong>${title}</strong></div>`
    }

    if (this.state.created) {
      const date = dateFormat(new Date(Date.parse(this.state.created)))
      html += `<div>Date: <strong>${date}</strong></div>`
    }

    if (this.state.id) {
      const url = this.getUrl()
      copyButton = true
      html +=
        `<div class="url">` +
        `URL: <a href="${url}">${url}</a>` +
        `<span class="copy" data-url="${url}"></span>` +
        `<span class="copy-success fade hidden">Copied</span>` +
        `</div>`
    }

    html += `</div>`

    const [added, removed] = diffStats(this.state.diff)
    html +=
      '' +
      `<div class="diff-stats flex-row">` +
      `<span class="grow">➖ ${removed} removed</span>` +
      `<span class="grow">➕ ${added} added</span>` +
      `</div>`

    header.innerHTML = html

    if (copyButton) {
      $('.diff-info .url .copy').onclick = this.copyUrl
    }
  }

  App.prototype.collectChangeBlocks = function () {
    const changedRows = []
    const fileWrappers = [...this.ui.diff.querySelectorAll('.d2h-file-wrapper')]

    for (const fileWrapper of fileWrappers) {
      const leftTbody = fileWrapper.querySelector(
        '.d2h-file-side-diff .d2h-diff-tbody'
      )
      if (!leftTbody) {
        continue
      }

      const rows = [...leftTbody.querySelectorAll('tr')]
      for (const row of rows) {
        const isChanged = !!row.querySelector(
          '.d2h-del, .d2h-ins, .d2h-change, .d2h-emptyplaceholder, .d2h-code-side-emptyplaceholder'
        )
        if (isChanged) {
          changedRows.push({ row, tbody: leftTbody })
        }
      }
    }

    if (!changedRows.length) {
      return []
    }

    const blocks = []
    let current = {
      rows: [changedRows[0].row],
      anchor: changedRows[0].row,
      tbody: changedRows[0].tbody,
      lastRow: changedRows[0].row,
    }

    for (let i = 1; i < changedRows.length; i++) {
      const item = changedRows[i]
      const sameTbody = item.tbody === current.tbody
      const isConsecutive =
        sameTbody &&
        item.row !== current.lastRow &&
        item.row.rowIndex === current.lastRow.rowIndex + 1

      if (isConsecutive) {
        current.rows.push(item.row)
        current.lastRow = item.row
        continue
      }

      blocks.push({
        rows: current.rows,
        anchor: current.anchor,
      })

      current = {
        rows: [item.row],
        anchor: item.row,
        tbody: item.tbody,
        lastRow: item.row,
      }
    }

    blocks.push({
      rows: current.rows,
      anchor: current.anchor,
    })

    return blocks
  }

  App.prototype.updateDiffNavCounter = function () {
    const total = this.state.changeBlocks.length
    const current = total ? this.state.currentBlockIndex + 1 : 0
    this.ui.diffNavCounter.textContent = `${current} / ${total}`

    this.ui.diffNavFirst.disabled = !total || this.state.currentBlockIndex <= 0
    this.ui.diffNavPrev.disabled = !total || this.state.currentBlockIndex <= 0
    this.ui.diffNavNext.disabled =
      !total || this.state.currentBlockIndex >= total - 1
    this.ui.diffNavLast.disabled =
      !total || this.state.currentBlockIndex >= total - 1
  }

  App.prototype.refreshDiffNavigation = function () {
    this.state.changeBlocks = this.collectChangeBlocks()
    this.state.currentBlockIndex = this.state.changeBlocks.length ? 0 : -1
    this.updateDiffNavCounter()
  }

  App.prototype.scheduleScrollSync = function () {
    if (this.ui.diff.classList.contains('hidden')) {
      return
    }

    if (this.state.isAutoScrolling) {
      return
    }

    if (this.state.scrollSyncRaf) {
      return
    }

    this.state.scrollSyncRaf = window.requestAnimationFrame(() => {
      this.state.scrollSyncRaf = 0
      this.syncCurrentBlockByViewport()
    })
  }

  App.prototype.syncCurrentBlockByViewport = function () {
    const blocks = this.state.changeBlocks
    if (!blocks.length) {
      if (this.state.currentBlockIndex !== -1) {
        this.state.currentBlockIndex = -1
        this.updateDiffNavCounter()
      }
      return
    }

    const markerTop = Math.min(180, window.innerHeight * 0.25)
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      if (!block || !block.anchor) {
        continue
      }
      const distance = Math.abs(block.anchor.getBoundingClientRect().top - markerTop)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    }

    if (bestIndex !== this.state.currentBlockIndex) {
      this.state.currentBlockIndex = bestIndex
      this.updateDiffNavCounter()
    }
  }

  App.prototype.goToChangeBlock = function (index) {
    const total = this.state.changeBlocks.length
    if (!total) {
      this.state.currentBlockIndex = -1
      this.updateDiffNavCounter()
      return
    }

    const nextIndex = Math.max(0, Math.min(index, total - 1))
    this.state.currentBlockIndex = nextIndex
    this.updateDiffNavCounter()

    const block = this.state.changeBlocks[nextIndex]
    if (!block || !block.anchor) {
      return
    }

    if (this.state.autoScrollTimer) {
      clearTimeout(this.state.autoScrollTimer)
    }
    this.state.isAutoScrolling = true

    block.anchor.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })

    this.state.autoScrollTimer = setTimeout(() => {
      this.state.isAutoScrolling = false
      this.syncCurrentBlockByViewport()
    }, 450)
  }

  App.prototype.scrollToFirstChangeOrTop = function () {
    const firstBlock = this.state.changeBlocks[0]
    if (firstBlock && firstBlock.anchor) {
      this.goToChangeBlock(0)
      return
    }

    const diffHeader = this.ui.diff.querySelector('.d2h-file-header')
    if (diffHeader) {
      diffHeader.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      })
      return
    }

    this.ui.diff.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    })
  }

  App.prototype.getUrl = function () {
    const basePath = window.BASE_PATH.endsWith('/') ? window.BASE_PATH : window.BASE_PATH + '/'
    return this.state.id ? window.location.origin + basePath + this.state.id : null
  }

  App.prototype.copyUrl = async function (e) {
    const target = e.currentTarget
    const url = target.getAttribute('data-url')

    try {
      await navigator.clipboard.writeText(url)
    } catch (e) {
      this.error(e.message)
      return
    }

    const success = target.nextSibling
    success.show()
    // success.fadeOut()
    setTimeout(() => success.hide(), 1000)
  }

  App.prototype.restore = function () {
    const [fileA, fileB] = restoreDiff(this.state.diff)
    this.ui.title.value = this.state.title
    this.ui.fileA.value = fileA
    this.ui.fileB.value = fileB
    // Пересчитываем data из текущих файлов
    const diff = Diff.createTwoFilesPatch('fileA', 'fileB', fileA, fileB, 'old', 'new', { context: Infinity })
    this.state.data = buffer
      .Buffer(pako.deflate(diff))
      .toString('hex')
    this.state.diff = null
    this.state.changeBlocks = []
    this.state.currentBlockIndex = -1
    this.updateDiffNavCounter()
  }

  App.prototype.toggleView = function (mode) {
    // this.ui.loader.hide()
    if (mode == VIEW_MODE_DIFF) {
      this.ui.diff.show()
      this.ui.diffNav.show()
      this.ui.form.hide()
      this.ui.compare.hide()
      this.ui.edit.show()
      this.ui.save.show()
      this.updateDiffNavCounter()
    } else if (mode === VIEW_MODE_EDIT) {
      this.ui.diff.hide()
      this.ui.diffNav.hide()
      this.ui.form.show()
      this.ui.compare.show()
      this.ui.edit.hide()
      this.ui.save.hide()
      for (const editor of window.editors) {
        editor.updateLineNumbers()
      }
    }
  }

  App.prototype.modal = function (title, content) {
    if (!content) {
      throw Error('Empty content')
    }
    this.ui.modalTitle.innerHTML = title || ''
    this.ui.modalContent.innerHTML = content
    MicroModal.show(MODAL_ID)
  }

  App.prototype.error = function (msg) {
    this.modal('ERROR', msg)
  }

  App.prototype.save = function () {
    this.ui.save.disabled = true
    const body = {
      title: this.state.title,
      data: this.state.data,
    }
    
    const method = this.state.id ? 'PUT' : 'POST'
    const url = this.state.id ? `api/save/${this.state.id}` : 'api/save'
    
    fetch(url, {
      method: method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.id) {
          throw Error('Save failed')
        }
        this.state.id = data.id
        this.ui.save.hide()
        if (method === 'POST') {
          window.location.href = data.id
        } else {
          window.location.reload()
        }
      })
      .catch((err) => {
        this.error(err)
      })
      .finally(() => {
        this.ui.save.disabled = false
      })
  }

  App.prototype.init = function () {
    MicroModal.init({ debug: true })
    if (this.state.id && this.state.data) {
      try {
        this.state.diff = decode(this.state.data)
      } catch (e) {
        console.log(e)
        this.error('Decode error')
        this.toggleView(VIEW_MODE_EDIT)
        return
      }
      this.render()
      this.toggleView(VIEW_MODE_DIFF)
    } else {
      this.toggleView(VIEW_MODE_EDIT)
    }
    return this
  }

  window.onload = function () {
    window.app = new App().init()
  }
})()
