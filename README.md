# Wspólna kuchnia

Prywatna aplikacja dla dwóch (lub więcej) osób: przepisy z tagami, losowanie, plan tygodnia, wspólna lista zakupów, spiżarnia, historia i oceny. Jeden kod działa na Androidzie, iPhonie i Windowsie (PWA). Nie ma serwera – wszystkie dane leżą w folderze **Kuchnia** na Dysku Google:

```
Kuchnia/
├── przepisy/   ← jeden plik JSON na przepis
└── Dane        ← Arkusz Google: Lista zakupów, Plan, Historia, Oceny, Produkty, Ustawienia
```

Zanim cokolwiek skonfigurujesz, możesz otworzyć `index.html` przez dowolny serwer lokalny i kliknąć **Wypróbuj na przykładowych danych** – tryb demo trzyma dane tylko w przeglądarce.

---

## 1. Opublikuj aplikację (GitHub Pages)

1. Załóż repozytorium na GitHubie, np. `kuchnia`, i wrzuć do niego całą zawartość tego folderu (tak, żeby `index.html` był w głównym katalogu repozytorium).
2. W repozytorium: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, gałąź `main`, folder `/ (root)`. Zapisz.
3. Po minucie aplikacja będzie pod adresem `https://TWÓJ-LOGIN.github.io/kuchnia/`. Zapisz ten adres – przyda się w kroku 2.

Netlify i Cloudflare Pages też działają – wystarczy wgrać folder.

## 2. Konfiguracja Google (jednorazowo, ok. 10 minut)

1. Wejdź na <https://console.cloud.google.com/> i utwórz nowy projekt, np. „Kuchnia”.
2. **APIs & Services → Library**: włącz **Google Drive API** oraz **Google Sheets API**.
3. **APIs & Services → OAuth consent screen** (w nowym interfejsie: **Google Auth Platform**):
   - typ użytkownika **External**, nazwa aplikacji „Wspólna kuchnia”, Twój e-mail jako kontakt,
   - w zakładce **Audience / Test users** dodaj adresy Gmail obu osób,
   - aplikację zostaw w trybie **Testing** – weryfikacja przez Google nie jest potrzebna.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - typ: **Web application**,
   - **Authorized JavaScript origins**: `https://TWÓJ-LOGIN.github.io`
   - **Authorized redirect URIs**: `https://TWÓJ-LOGIN.github.io/kuchnia/` (dokładnie, z ukośnikiem na końcu).
5. Skopiuj **Client ID** i wpisz go w `config.js`:
   ```js
   CLIENT_ID: '1234567890-abc123.apps.googleusercontent.com',
   ```
6. Wyślij zmianę do repozytorium. Gotowe.

Przy pierwszym logowaniu Google pokaże ostrzeżenie „Google nie zweryfikował tej aplikacji” – to normalne w trybie testowym. Kliknij **Kontynuuj**. Aplikacja prosi o pełny dostęp do Dysku, bo musi widzieć pliki przepisów dodane także spoza aplikacji (np. wrzucone ręcznie).

> W trybie testowym Google może co 7 dni prosić o ponowną zgodę. Aplikacja wtedy po prostu przekieruje Cię do logowania.

## 3. Pierwsze uruchomienie

**Pierwsza osoba** otwiera aplikację i loguje się. Aplikacja sama tworzy folder `Kuchnia`, podfolder `przepisy` i arkusz `Dane` ze wszystkimi zakładkami. Następnie w Dysku Google udostępnij folder **Kuchnia** drugiej osobie jako **Edytor**.

**Druga osoba** (musi być dodana jako tester w kroku 2.3) otwiera ten sam adres i loguje się swoim kontem. Aplikacja znajdzie udostępniony folder i zaproponuje jego użycie.

Jeśli ktoś ma kilka folderów „Kuchnia”, wpisz ID właściwego w `config.js` (`FOLDER_ID` – fragment adresu folderu po `/folders/`).

## 4. Instalacja na urządzeniach

- **Android**: Chrome → menu ⋮ → **Zainstaluj aplikację** (albo „Dodaj do ekranu głównego”).
- **iPhone / iPad**: Safari → **Udostępnij** → **Dodaj do ekranu początkowego**.
- **Windows**: Edge lub Chrome → ikona instalacji w pasku adresu → **Zainstaluj**. Aplikacja otwiera się we własnym oknie i ma skrót w menu Start.

## 5. Przepisy ze stron internetowych przez Claude

1. W Claude utwórz Projekt, np. „Przepisy do kuchni”, i wklej jako instrukcję projektu treść pliku `polecenie-dla-claude.txt` (to samo kopiuje przycisk **Kopiuj polecenie** w aplikacji).
2. W rozmowie w tym projekcie wklej link do przepisu. Claude zwróci JSON.
3. W aplikacji: **Przepisy → Importuj**, wklej JSON, **Sprawdź**, potem **Dalej: sprawdź i zapisz**. Aplikacja wskaże błędy (np. brak tytułu, zła jednostka) i podpowie nazwy składników, które już znacie („pomidory” → „pomidor”).

Możesz też wrzucać pliki `.json` bezpośrednio do folderu `Kuchnia/przepisy` – aplikacja je wczyta przy następnej synchronizacji.

## 6. Jak to działa

| Dane | Gdzie | Synchronizacja |
|---|---|---|
| Przepisy | pliki JSON w `przepisy/` | przy starcie i wejściu w Przepisy pobierane są tylko zmienione pliki |
| Lista zakupów | arkusz, zakładka „Lista zakupów” | co 15 s, gdy lista jest na ekranie; działa też bez internetu |
| Plan, Historia, Oceny, Produkty, Ustawienia | arkusz „Dane” | przy wejściu na ekran |

- Każda zmiana jest zapisywana lokalnie od razu i trafia do kolejki. Bez internetu kolejka czeka („X zmian czeka na wysłanie”) i wysyła się po powrocie sieci. Zmiany dotyczą pojedynczych wierszy, więc dwie osoby nie nadpisują sobie danych.
- Usunięcie przepisu przenosi plik do kosza Dysku – można go stamtąd przywrócić.
- Wylogowanie nie usuwa niczego z Dysku.
- Arkusz „Dane” możesz przeglądać i poprawiać ręcznie. Nie zmieniaj tylko nazw zakładek i nagłówków w pierwszym wierszu.
- Ustawienia (kolejność działów, podstawy, aliasy, losowanie) są wspólne dla obu osób – trzymane w zakładce „Ustawienia”.

## Pliki

```
index.html            szkielet strony
config.js             Twoja konfiguracja (CLIENT_ID)
styles.css            wygląd „Pastelowa naklejka”, jasny i ciemny motyw
sw.js                 service worker – aplikacja otwiera się bez internetu
manifest.webmanifest  dane do instalacji
js/google.js          logowanie Google, Dysk i Arkusze
js/store.js           stan, pamięć podręczna (IndexedDB), kolejka offline, logika
js/schema.js          kolumny arkusza
js/demo.js            tryb demo z przykładowymi danymi
js/views/*.js         ekrany
```

Po zmianie plików aplikacji podbij `VERSION` w `sw.js`, żeby zainstalowane kopie pobrały nową wersję.
