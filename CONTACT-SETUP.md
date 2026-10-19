# Kontaktní formuláře – Resend a Vercel

Web používá statické HTML/CSS/JS a serverovou Node.js funkci `/api/contact`.
Vercel projekt musí mít Root Directory nastavený na složku obsahující `package.json`,
`vercel.json`, `api/` a `index.html`. V repozitáři Robicio/resilium-new je to kořen.
Framework: Other. Build: `npm run build`. Output: `public`.
Starší `build-site.mjs` je původní samostatný balíček webu a pro Vercel se nepoužívá.

## Proměnné prostředí (pouze server)

- `RESEND_API_KEY`: existující API klíč Resendu s oprávněním odesílat za ověřenou doménu resilium.cz.
- `CONTACT_EMAIL_TO`: povinná konkrétní e-mailová adresa příjemce poptávek. Jedna adresa bez zobrazovaného jména. Bez této proměnné server vrátí jasnou konfigurační chybu; žádná náhradní adresa není použita.

Podle zadání jsou obě proměnné již nastavené pro Production a `CONTACT_EMAIL_TO`
obsahuje `robert@resilium.cz`. Aplikace adresu stále čte pouze ze serverové proměnné.
Pro Preview nastavte proměnné samostatně, pokud chcete e-maily ověřovat i tam.
Po nahrání změn je nutný nový deployment. Hodnoty ve Vercelu nebyly tímto lokálním testem ověřované.
Hodnoty nevkládejte do zdrojových souborů ani do proměnných s veřejným prefixem.
`.env.example` obsahuje pouze prázdné vzory. `.env*` jsou ignorované.

## Zpracování

Hlavní formulář rozlišuje Firma, Lídr a Jednotlivec. Stejný endpoint obsluhuje
samostatnou firemní poptávku, konzultaci lídra a oba formuláře přihlášky jednotlivce.
Skrytá pole jiné kategorie se neposílají. Fakturační údaje přihlášek jsou zahrnuté.
Souhlasy zůstaly zachované, na dvou samostatných poptávkách byly doplněné.

Odesílatel je vždy `poptavky@resilium.cz`. Adresa zákazníka je `reply_to` v Resend REST API.
Administrátor dostane HTML i text se všemi vyplněnými údaji. Potvrzení zákazníkovi
se odešle až po přijetí zprávy pro administrátora. Jeho selhání se zapíše bez osobních
údajů do serverových logů a poptávka zůstává úspěšná. Přijetí API neznamená záruku
doručení do schránky; konečný stav ověřte v Resend Emails.

Frontend blokuje dvojklik a v sessionStorage uchovává jen hash formuláře a náhodné ID,
nikoliv jméno, e-mail ani obsah. Při opakování stejného pokusu používá stejné ID.
Resend idempotency keys chrání obě zprávy při retry i restartu serveru po dobu 24 hodin.
Klient ID obnoví po 23 hodinách. Změněný obsah je nová poptávka.

Spam: skryté honeypot pole, kontrola originu, whitelist polí, limity délek, 10 požadavků
za 10 minut z IP a maximálně 5 různých poptávek na jednu zákaznickou e-mailovou adresu
za 10 minut na jednu zahřátou instanci funkce. Identické retry nečerpá další místo v e-mailovém limitu.
Souběžné stejné požadavky sdílejí probíhající odeslání. Adresa je v počítadle pouze jako hash.
Počítadlo je v paměti, mezi instancemi
ani po cold startu se nesdílí. Pro sdílený produkční limit nastavte ve Vercel Firewall
pravidlo rate limiting pro `/api/contact` (např. 10 POST / 10 minut podle IP, dle možností tarifu).
Paměťový limit sám není globální ochrana proti distribuovanému spamu.

## Ověření před nasazením

Node.js 22, žádné nové externí závislosti:

```sh
npm test
npm run build
```

Testy API používají simulovaný Resend, neposílají skutečné e-maily.
Obsah `public` zahrnuje jen HTML a assets, žádné serverové zdroje, testy ani dokumentaci.
Funkci sestaví samostatně Vercel. Statický hosting a otevření přes `file://` e-maily neposílají.

## Produkční kontrola

1. Nahrát připravené změny do repozitáře připojeného k Vercelu a vytvořit nový Production deployment
   s již nastavenými `CONTACT_EMAIL_TO` a `RESEND_API_KEY`.
2. Na hlavní stránce odeslat po jedné poptávce Firma, Lídr a Jednotlivec z vlastní testovací adresy.
3. Ověřit správný předmět, kategorii, všechna pole a funkci Odpovědět u administrátora.
4. Ověřit přesné potvrzení zákazníkovi a oba záznamy v Resend Emails.
5. Vyzkoušet samostatné firemní a lídrovské formuláře a obě přihlášky s fakturačními údaji.
6. Zkontrolovat povinná pole a souhlas, dvojklik a opakované odeslání stejného pokusu.
7. Ve Vercel Logs zkontrolovat případné `contact:` chyby. Selhání potvrzení neopravovat
   opakovaným odesíláním již přijaté poptávky administrátorovi.

Dokumentace: https://resend.com/docs/api-reference/emails/send-email,
https://resend.com/docs/dashboard/emails/idempotency-keys,
https://vercel.com/docs/functions/runtimes/node-js.
