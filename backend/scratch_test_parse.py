import requests
import re
import json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
}
url = 'https://brawltime.ninja/tier-list/brawler'
r = requests.get(url, headers=headers)
print("Status code:", r.status_code)

match_json = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', r.text, re.DOTALL)
if match_json:
    data = json.loads(match_json[0])
    queries = data.get('vueQueryState', {}).get('queries', [])
    print("Found", len(queries), "queries in vueQueryState")
    for idx, q in enumerate(queries):
        query_hash = q.get('queryHash', '')
        if 'klicker-query' in str(query_hash):
            state = q.get('state', {})
            res_data = state.get('data', {})
            print(f"\n--- Query {idx}: Hash: {query_hash} ---")
            print("Kind:", res_data.get('kind'))
            print("Query:", res_data.get('query'))
            inner_data = res_data.get('data', [])
            print("Inner list length:", len(inner_data))
            if len(inner_data) > 0:
                print("Sample element:", inner_data[0])
else:
    print("Could not find script block with JSON state")
