// Konfiguracja „Wspólnej kuchni”. Instrukcja: README.md, sekcja „Konfiguracja Google”.
window.KUCHNIA_CONFIG = {
  // Wymagane: identyfikator klienta OAuth (typ „Web application”) z Google Cloud Console,
  // np. '1234567890-abc123.apps.googleusercontent.com'
  CLIENT_ID: '310224762542-1qf2774qo7o4r6c6vrpc915hb1v604qt.apps.googleusercontent.com',

  // Opcjonalne: ID folderu „Kuchnia” na Dysku (fragment adresu po /folders/).
  // Ustaw, jeśli ktoś ma kilka folderów o tej nazwie.
  FOLDER_ID: '',

  // Opcjonalne: adres przekierowania po logowaniu. Domyślnie dokładny adres aplikacji,
  // np. 'https://twoj-login.github.io/kuchnia/'. Musi być wpisany w Google Cloud Console.
  REDIRECT_URI: '',
};
