"""
scrape_brawlify.py
==================
Scraper local de Brawlify para extraer estadísticas de brawlers por mapa.

Genera dos archivos JSON que alimentan el pipeline de Django:
  - ../backend/apps/core/management/commands/maps_tiered_stats.json
  - ../backend/apps/core/management/commands/brawlers_global_stats.json

Uso:
    pip install -r requirements.txt
    playwright install chromium
    python scrape_brawlify.py [--dry-run] [--headless]

    --dry-run   Procesa solo el primer mapa (para validar la estructura)
    --headless  Lanza el browser sin interfaz visual (por defecto: True)
"""

import asyncio
import json
import re
import sys
import argparse
import os
from collections import defaultdict
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

try:
    from playwright_stealth import Stealth as _StealthCls
    _stealth_instance = _StealthCls()
    STEALTH_AVAILABLE = True
    async def stealth_async(page):
        await _stealth_instance.apply_stealth_async(page)
except Exception:
    STEALTH_AVAILABLE = False
    print("[WARN] playwright-stealth no disponible. Continuando sin stealth.")



# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

MAP_IDS = [
    "15000005", "15000007", "15000010", "15000011", "15000018",
    "15000019", "15000022", "15000025", "15000050", "15000053",
    "15000072", "15000082", "15000083", "15000115", "15000118",
    "15000132", "15000292", "15000293", "15000300", "15000306",
    "15000367", "15000368", "15000440", "15000502", "15000548",
    "15000703",
]

TROPHY_RANGE = "1000+"
BASE_URL = "https://brawlify.com/maps/{map_id}?range=1000%2B"

# Orden de los contenedores scrollable en el DOM de Brawlify
CATEGORIES = ["best_pick", "winner", "most_used", "not_recommended"]

# Directorio de salida (relativo a este script)
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / ".." / "backend" / "apps" / "core" / "management" / "commands"

MAPS_OUTPUT = OUTPUT_DIR / "maps_tiered_stats.json"
GLOBAL_OUTPUT = OUTPUT_DIR / "brawlers_global_stats.json"

# Delays y timeouts
PAGE_TIMEOUT_MS = 45_000    # Timeout de carga de página
DELAY_BETWEEN_MAPS_MS = 600  # Pausa entre mapas para evitar rate-limit
MAX_RETRIES = 2              # Reintentos por mapa en caso de error


# ---------------------------------------------------------------------------
# Helpers de parsing
# ---------------------------------------------------------------------------

def parse_percentage(text: str) -> float:
    """Convierte '54.30%' o '5.63%' en 0.5430 o 0.0563."""
    text = text.strip().replace("%", "").replace(",", ".")
    try:
        return round(float(text) / 100, 6)
    except ValueError:
        return 0.0


def extract_brawler_id_from_href(href: str) -> str | None:
    """Extrae el brawler_id del query param `team` de una URL de Brawlify."""
    match = re.search(r"[?&]team=(\d+)", href or "")
    return match.group(1) if match else None


# ---------------------------------------------------------------------------
# Scraping de un mapa
# ---------------------------------------------------------------------------

async def scrape_map(page, map_id: str, verbose: bool = True) -> dict | None:
    url = BASE_URL.format(map_id=map_id)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if verbose:
                print(f"  → Navegando a {url} (intento {attempt}/{MAX_RETRIES})...")

            # domcontentloaded es mucho más rápido y suficiente —
            # Brawlify hace polling continuo que impide que networkidle se dispare.
            await page.goto(url, timeout=PAGE_TIMEOUT_MS, wait_until="domcontentloaded")

            # Esperar a que los contenedores scrollable aparezcan en el DOM
            try:
                await page.wait_for_selector("div[scrollable='true']", timeout=25_000)
            except PlaywrightTimeoutError:
                print(f"  [WARN] Mapa {map_id}: los contenedores scrollable no aparecieron a tiempo.")

            # Pequeña pausa adicional para que el JS termine de renderizar
            await asyncio.sleep(1.5)

            # Extraer nombre del mapa desde el h1 o el título de la página
            map_name = ""
            try:
                h1 = page.locator("h1").first
                map_name = (await h1.inner_text(timeout=5_000)).strip()
            except Exception:
                pass

            if not map_name:
                title = await page.title()
                map_name = title.split("-")[0].strip() if "-" in title else title.strip()

            # Encontrar los 4 contenedores scrollable
            scrollables = page.locator("div[scrollable='true']")
            count = await scrollables.count()

            if count == 0:
                print(f"  [WARN] Mapa {map_id}: no se encontraron contenedores scrollable.")
                return None

            stats = []
            for cat_idx in range(min(count, len(CATEGORIES))):
                category = CATEGORIES[cat_idx]
                container = scrollables.nth(cat_idx)

                cards = container.locator("a")
                card_count = await cards.count()

                for i in range(card_count):
                    card = cards.nth(i)

                    # brawler_id desde el href
                    href = await card.get_attribute("href") or ""
                    brawler_id = extract_brawler_id_from_href(href)
                    if not brawler_id:
                        continue

                    # Nombre del brawler desde el primer <p>
                    brawler_name = ""
                    try:
                        name_el = card.locator("p").first
                        brawler_name = (await name_el.inner_text(timeout=2_000)).strip()
                    except Exception:
                        pass

                    # Win rate y pick rate desde los <span>
                    spans = card.locator("span")
                    span_count = await spans.count()

                    win_rate_text = await spans.nth(0).inner_text(timeout=2_000) if span_count > 0 else "0%"
                    pick_rate_text = await spans.nth(1).inner_text(timeout=2_000) if span_count > 1 else "0%"

                    win_rate = parse_percentage(win_rate_text)
                    pick_rate = parse_percentage(pick_rate_text)

                    stats.append({
                        "brawler_id": brawler_id,
                        "brawler_name": brawler_name,
                        "win_rate": win_rate,
                        "pick_rate": pick_rate,
                        "category": category,
                    })

            if verbose:
                print(f"  ✓ {map_name} ({map_id}): {len(stats)} brawlers en {min(count, 4)} categorías.")

            return {
                "map_id": map_id,
                "map_name": map_name,
                "trophy_range": TROPHY_RANGE,
                "stats": stats,
            }

        except PlaywrightTimeoutError:
            print(f"  [ERROR] Timeout en mapa {map_id} (intento {attempt}).")
        except Exception as e:
            print(f"  [ERROR] Mapa {map_id} (intento {attempt}): {e}")

        if attempt < MAX_RETRIES:
            await asyncio.sleep(1.0)

    print(f"  [SKIP] Mapa {map_id} falló tras {MAX_RETRIES} intentos.")
    return None


# ---------------------------------------------------------------------------
# Cálculo de estadísticas globales
# ---------------------------------------------------------------------------

def compute_global_stats(maps_data: list[dict]) -> list[dict]:
    """
    Calcula el promedio de win_rate y pick_rate por brawler
    a través de todos los mapas procesados.
    """
    accumulator: dict[str, dict] = defaultdict(lambda: {
        "brawler_name": "",
        "win_rate_sum": 0.0,
        "pick_rate_sum": 0.0,
        "count": 0,
    })

    for map_entry in maps_data:
        for stat in map_entry.get("stats", []):
            bid = stat["brawler_id"]
            accumulator[bid]["brawler_name"] = stat["brawler_name"]
            accumulator[bid]["win_rate_sum"] += stat["win_rate"]
            accumulator[bid]["pick_rate_sum"] += stat["pick_rate"]
            accumulator[bid]["count"] += 1

    global_stats = []
    for brawler_id, data in sorted(accumulator.items(), key=lambda x: int(x[0]), reverse=True):
        n = data["count"]
        if n == 0:
            continue
        global_stats.append({
            "brawler_id": brawler_id,
            "brawler_name": data["brawler_name"],
            "win_rate": round(data["win_rate_sum"] / n, 6),
            "pick_rate": round(data["pick_rate_sum"] / n, 6),
        })

    return global_stats


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

async def main(dry_run: bool = False, headless: bool = True):
    map_ids = MAP_IDS[:1] if dry_run else MAP_IDS
    mode = "DRY-RUN (1 mapa)" if dry_run else f"{len(map_ids)} mapas"

    print(f"\n{'='*60}")
    print(f"  Brawlify Scraper — Modo: {mode}")
    print(f"  Stealth: {'activado' if STEALTH_AVAILABLE else 'NO disponible'}")
    print(f"  Headless: {headless}")
    print(f"  Salida: {OUTPUT_DIR.resolve()}")
    print(f"{'='*60}\n")

    maps_data = []
    failed_maps = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )

        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            viewport={"width": 1280, "height": 800},
            java_script_enabled=True,
        )

        page = await context.new_page()

        # Aplicar stealth si está disponible
        if STEALTH_AVAILABLE:
            await stealth_async(page)

        # Warm-up: visitar la home de Brawlify para obtener cookies de sesión
        print("⏳ Warm-up: cargando brawlify.com para obtener cookies de sesión...")
        try:
            await page.goto("https://brawlify.com", timeout=30_000, wait_until="domcontentloaded")
            await asyncio.sleep(1.5)
            print("✓ Warm-up completado.\n")
        except Exception as e:
            print(f"[WARN] Warm-up falló ({e}), continuando de todas formas...\n")

        # Scraping de cada mapa
        for i, map_id in enumerate(map_ids, 1):
            print(f"[{i:02d}/{len(map_ids):02d}] Procesando mapa {map_id}...")
            result = await scrape_map(page, map_id)

            if result:
                maps_data.append(result)
            else:
                failed_maps.append(map_id)

            # Pausa entre requests
            if i < len(map_ids):
                await asyncio.sleep(DELAY_BETWEEN_MAPS_MS / 1000)

        await browser.close()

    # ---------------------------------------------------------------------------
    # Escribir archivos de salida
    # ---------------------------------------------------------------------------

    if not maps_data:
        print("\n[ERROR] No se obtuvo ningún dato. Abortando escritura de archivos.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # maps_tiered_stats.json
    with open(MAPS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(maps_data, f, ensure_ascii=False, indent=2)
    print(f"\n✅ maps_tiered_stats.json → {len(maps_data)} mapas ({MAPS_OUTPUT.stat().st_size / 1024:.1f} KB)")

    # brawlers_global_stats.json
    global_stats = compute_global_stats(maps_data)
    with open(GLOBAL_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(global_stats, f, ensure_ascii=False, indent=2)
    print(f"✅ brawlers_global_stats.json → {len(global_stats)} brawlers ({GLOBAL_OUTPUT.stat().st_size / 1024:.1f} KB)")

    # Reporte final
    print(f"\n{'='*60}")
    print(f"  RESUMEN")
    print(f"  Mapas procesados: {len(maps_data)}/{len(map_ids)}")
    if failed_maps:
        print(f"  Mapas fallidos:   {', '.join(failed_maps)}")
    total_stats = sum(len(m["stats"]) for m in maps_data)
    print(f"  Total de entradas de stats: {total_stats}")
    print(f"  Brawlers únicos globales:   {len(global_stats)}")
    print(f"{'='*60}\n")

    if failed_maps:
        print(f"[WARN] {len(failed_maps)} mapas no se pudieron scrapeaar.")
        print("Puedes re-ejecutar el script — los mapas fallidos serán reemplazados.")


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scraper de Brawlify para estadísticas de mapas ranked.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Procesa solo el primer mapa para validar la estructura del scraper.",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Lanza el browser con interfaz visual (útil para debugging).",
    )
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, headless=not args.no_headless))
