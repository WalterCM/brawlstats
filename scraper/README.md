# Brawlify Scraper → BrawlPlanet Scraper

Script local para extraer estadísticas de brawlers por mapa desde `brawlplanet.com` y generar los archivos JSON que alimentan el pipeline de datos de Brawl Stats.

> **Fuente elegida: BrawlPlanet** — Datos de +100M partidas actualizados por hora. No usa browser (usa `curl-cffi` para emular el TLS fingerprint de Chrome y bypasear protecciones). El HTML es server-rendered (SSR Next.js), por lo que los datos están directamente en el DOM sin necesidad de ejecutar JavaScript.

## Requisitos

- Python 3.11+
- `curl-cffi` (ya instalado en el `.venv` del backend)

## Instalación (primera vez)

```bash
cd brawlstats/
.venv/bin/pip install curl-cffi  # Solo si no está ya instalado
```

## Uso

### Ejecución normal (26 mapas, ~35 segundos)

```bash
cd scraper/
/home/walter/Dev/brawlstats/backend/.venv/bin/python scrape_brawlplanet.py
```

### Dry-run (solo 1 mapa, para validar)

```bash
/home/walter/Dev/brawlstats/backend/.venv/bin/python scrape_brawlplanet.py --dry-run
```

## Archivos generados

El script escribe directamente en la carpeta de comandos de Django:

| Archivo | Descripción |
|---|---|
| `../backend/apps/core/management/commands/maps_tiered_stats.json` | 26 mapas × 99 brawlers (354 KB) |
| `../backend/apps/core/management/commands/brawlers_global_stats.json` | Promedio global por brawler (8.6 KB) |

## Siguiente paso: Sincronizar con la DB

```bash
cd ../backend/
.venv/bin/python manage.py sync_meta_stats
```

Resultado esperado:
```
Successfully ingested 98 global brawler meta stats.
Successfully ingested 2548 map brawler stats. (0 maps skipped)
```

## Frecuencia recomendada

Los mapas de BrawlPlanet se actualizan con cada rotación de ranked (**aprox. semanal**). Ejecutar el scraper + sync + commit de los JSONs con cada nueva rotación.

## Troubleshooting

**Brawler no encontrado en DB:**
- Ejecutar primero `manage.py seed_catalog` para actualizar el catálogo
- Brawlers muy nuevos (`Glowbert`) aún no están en la API de Brawlify

**Mapa devuelve 404:**
- El slug del mapa en BrawlPlanet cambió o el mapa rotó fuera del pool ranked
- Actualizar `RANKED_MAP_POOL` en `scrape_brawlplanet.py` con los slugs actuales de `brawlplanet.com/powerleague`

**Tabla vacía (0 brawlers):**
- Esperar 30 segundos y reintentar — BrawlPlanet a veces tiene rate-limiting suave


## Requisitos

- Python 3.11+
- Conexión a internet

## Instalación (primera vez)

```bash
cd scraper/
pip install -r requirements.txt
playwright install chromium
```

## Uso

### Ejecución normal (26 mapas)

```bash
python scrape_brawlify.py
```

### Dry-run (solo 1 mapa, para validar)

```bash
python scrape_brawlify.py --dry-run
```

### Con browser visible (para debugging)

```bash
python scrape_brawlify.py --no-headless
```

## Archivos generados

El script escribe directamente en la carpeta de comandos de Django:

| Archivo | Descripción |
|---|---|
| `../backend/apps/core/management/commands/maps_tiered_stats.json` | Stats por mapa (26 mapas × ~107 brawlers) |
| `../backend/apps/core/management/commands/brawlers_global_stats.json` | Promedio global por brawler |

## Siguiente paso: Sincronizar con la DB

```bash
cd ../backend/
.venv/bin/python manage.py sync_meta_stats
```

## Frecuencia recomendada

Los datos de Brawlify se actualizan con cada rotación de mapas ranked (**aprox. semanal**). Se recomienda ejecutar el scraper y hacer commit de los JSONs actualizados con cada rotación.

## Troubleshooting

**El browser no carga / timeout:**
- Ejecutar con `--no-headless` para ver qué pasa visualmente
- Si aparece un captcha de Cloudflare, esperar unos minutos e intentar de nuevo

**`playwright-stealth` no instalado:**
- El script funciona sin él pero puede ser detectado por Cloudflare
- Instalar con: `pip install playwright-stealth`

**Mapa no encontrado (0 scrollables):**
- Verificar que el map_id sigue activo en Brawlify
- Los mapas pueden cambiar con cada season de ranked
