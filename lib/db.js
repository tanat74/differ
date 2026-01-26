const postgres = require('postgres')
const config = require('./config')
const { generateSlug } = require('./slug')

const sql = postgres(config.DB)

const load = async (slug) => {
  const res =
    await sql`SELECT id, created, title, data FROM items WHERE slug=${slug}`
  return res.length ? res[0] : null
}

const save = async (data, title = null) => {
  let slug
  let retries = 5
  
  while (retries > 0) {
    slug = generateSlug()
    try {
      const res =
        await sql`INSERT INTO items(slug, data, title) VALUES (${slug}, decode(${data}, 'hex'), ${title}) RETURNING slug`
      return res[0].slug
    } catch (e) {
      if (e.code === '23505') { // unique constraint violation
        retries--
        if (retries === 0) throw e
        continue
      }
      throw e
    }
  }
}

const update = async (slug, data, title = null) => {
  const res =
    await sql`UPDATE items SET data=decode(${data}, 'hex'), title=${title}, created=CURRENT_TIMESTAMP WHERE slug=${slug} RETURNING slug`
  return res.length ? res[0].slug : null
}

const list = async (limit = 100, offset = 0) => {
  const total = await sql`SELECT COUNT(*) AS count FROM items`
  const res =
    await sql`SELECT slug FROM items ORDER BY id LIMIT ${limit} OFFSET ${offset}`
  return [res.map((x) => x.slug), total[0].count]
}

const stats = async () => {
  const res =
    await sql`SELECT COUNT(*) AS cnt, SUM(LENGTH(data)) + (23 * COUNT(*)) AS sz FROM items`.simple()
  const row = res.pop()
  return {
    count: row.cnt,
    size: row.sz,
  }
}

const check = async () => {
  try {
    return (await sql`SELECT 1 as v`).pop().v === 1
  } catch (e) {
    console.log(e)
    return false
  }
}

module.exports = { load, save, update, list, check, stats }
