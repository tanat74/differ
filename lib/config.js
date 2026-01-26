// Default configuration values
const defaults = {
  POSTGRES_USER: 'postgres',
  POSTGRES_PASSWORD: 'secret123',
  POSTGRES_DB: 'differ',
  DB: 'postgres://postgres:secret123@db:5432/differ',
  INSTANCES: '2',
  NODE_ENV: 'production',
  BASE_PATH: '/',
}

// Load environment variables with defaults
const config = {}
for (const [key, defaultValue] of Object.entries(defaults)) {
  config[key] = process.env[key] || defaultValue
}

module.exports = config
