# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - navigation "Hlavní navigace" [ref=e6]:
      - button "Menu" [ref=e8] [cursor=pointer]
  - main [ref=e9]:
    - heading "Skladové hospodářství" [level=1] [ref=e10]
    - generic [ref=e11]:
      - generic [ref=e12]: "Stavy view:"
      - generic [ref=e13]:
        - link "Výchozí" [ref=e14] [cursor=pointer]:
          - /url: /sklad?state=default
        - link "Načítání" [ref=e15] [cursor=pointer]:
          - /url: /sklad?state=loading
        - link "Prázdno" [ref=e16] [cursor=pointer]:
          - /url: /sklad?state=empty
        - link "Chyba" [ref=e17] [cursor=pointer]:
          - /url: /sklad?state=error
        - link "Offline" [ref=e18] [cursor=pointer]:
          - /url: /sklad?state=offline
        - link "Údržba" [ref=e19] [cursor=pointer]:
          - /url: /sklad?state=maintenance
        - link "404" [ref=e20] [cursor=pointer]:
          - /url: /sklad?state=404
  - link "KÁJOVO" [ref=e28] [cursor=pointer]:
    - /url: /
```