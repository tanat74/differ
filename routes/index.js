const express = require('express')
const createError = require('http-errors')
const db = require('../lib/db')
const { exec } = require('../lib/exec')
const { getUrl } = require('../lib/url')
const { getPagedResponse } = require('../lib/paging')
const { formatDataSize } = require('../lib/format')

const router = express.Router()

router.get('/', function (req, res, next) {
  res.render('index', { context: '{}' })
})

router.get('/:slug', async function (req, res, next) {
  try {
    const item = await db.load(req.params.slug)
    if (!item) {
      return next(createError(404))
    }
    res.render('index', {
      context: JSON.stringify({
        id: req.params.slug,
        created: item.created,
        title: item.title,
        data: Buffer.from(item.data).toString('hex'),
      }),
    })
  } catch (e) {
    next(createError(404))
  }
})

router.post('/api/save', async function (req, res, next) {
  const data = req.body.data
  const title = req.body.title
  let slug
  try {
    slug = await db.save(data, title)
  } catch (e) {
    return res.status(500).json({ error: e })
  }
  const result = { id: slug }
  res.status(201).json(result)
})

router.put('/api/save/:slug', async function (req, res, next) {
  const slug = req.params.slug
  const data = req.body.data
  const title = req.body.title
  try {
    const updated = await db.update(slug, data, title)
    if (!updated) {
      return res.status(404).json({ error: 'Not found' })
    }
  } catch (e) {
    return res.status(500).json({ error: e })
  }
  const result = { id: slug }
  res.status(200).json(result)
})

router.get('/api/stats', async function (req, res, next) {
  const stats = await db.stats()

  stats.size = formatDataSize(stats.size)
  res.json(stats)
})

router.get('/api/list', async function (req, res, next) {
  const limit = Math.min(+req.query.limit || 100, 100)
  const offset = +req.query.offset || 0
  const [items, total] = await db.list(limit, offset)
  const data = items.map((x) => getUrl(req, x))
  res.json(getPagedResponse(req, limit, offset, data, total))
})

module.exports = router
