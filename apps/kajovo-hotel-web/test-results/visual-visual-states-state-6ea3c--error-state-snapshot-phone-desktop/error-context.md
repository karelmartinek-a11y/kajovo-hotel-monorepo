# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - navigation "Hlavní navigace" [ref=e6]:
      - button "Menu" [ref=e8] [cursor=pointer]
  - main [ref=e9]:
    - heading "Ztráty a nálezy" [level=1] [ref=e10]
    - generic [ref=e11]:
      - generic [ref=e12]: "Stavy view:"
      - generic [ref=e13]:
        - link "Výchozí" [ref=e14] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=default
        - link "Načítání" [ref=e15] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=loading
        - link "Prázdno" [ref=e16] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=empty
        - link "Chyba" [ref=e17] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=error
        - link "Offline" [ref=e18] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=offline
        - link "Údržba" [ref=e19] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=maintenance
        - link "404" [ref=e20] [cursor=pointer]:
          - /url: /ztraty-a-nalezy?state=404
    - generic [ref=e21]:
      - heading "Chyba" [level=2] [ref=e22]
      - paragraph [ref=e23]: Nepodařilo se načíst data. Zkuste stránku obnovit.
      - button "Obnovit" [ref=e25] [cursor=pointer]
  - link "KÁJOVO" [ref=e26] [cursor=pointer]:
    - /url: /
```