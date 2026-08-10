/**
 * Hero copy in the 15 shipped locales, carried over from the original site.
 * Only these keys are translated; the rest of the page is English, which is what
 * the previous implementation did too.
 */

export interface Strings {
  heroTitle: string;
  heroCopy: string;
  startTest: string;
}

export const translations = {
  en: {
    heroTitle: "Test your internet speed anywhere on Earth",
    heroCopy:
      "WifiPlus measures speed, latency, DNS response, packet loss, and WiFi health, then compares results against providers in every major global region.",
    startTest: "Start Global Test",
  },
  hi: {
    heroTitle: "दुनिया में कहीं भी इंटरनेट स्पीड टेस्ट करें",
    heroCopy:
      "WifiPlus स्पीड, लेटेंसी, DNS, पैकेट लॉस और WiFi हेल्थ मापता है और परिणामों की तुलना वैश्विक प्रदाताओं से करता है.",
    startTest: "ग्लोबल टेस्ट शुरू करें",
  },
  ar: {
    heroTitle: "اختبر سرعة الإنترنت في أي مكان في العالم",
    heroCopy:
      "يقيس WifiPlus السرعة وزمن الاستجابة وDNS وفقدان الحزم وصحة WiFi ثم يقارن النتائج بمزودي الخدمة عالميًا.",
    startTest: "ابدأ الاختبار العالمي",
  },
  es: {
    heroTitle: "Prueba tu velocidad de internet en cualquier lugar",
    heroCopy:
      "WifiPlus mide velocidad, latencia, DNS, pérdida de paquetes y salud WiFi, y compara resultados con proveedores globales.",
    startTest: "Iniciar prueba global",
  },
  fr: {
    heroTitle: "Testez votre débit internet partout dans le monde",
    heroCopy:
      "WifiPlus mesure débit, latence, DNS, perte de paquets et santé WiFi, puis compare les résultats aux fournisseurs mondiaux.",
    startTest: "Lancer le test global",
  },
  de: {
    heroTitle: "Teste deine Internetgeschwindigkeit weltweit",
    heroCopy:
      "WifiPlus misst Geschwindigkeit, Latenz, DNS, Paketverlust und WiFi-Zustand und vergleicht Ergebnisse mit globalen Anbietern.",
    startTest: "Globalen Test starten",
  },
  pt: {
    heroTitle: "Teste sua internet em qualquer lugar do mundo",
    heroCopy:
      "WifiPlus mede velocidade, latência, DNS, perda de pacotes e saúde do WiFi, comparando resultados com provedores globais.",
    startTest: "Iniciar teste global",
  },
  zh: {
    heroTitle: "在全球任何地方测试网速",
    heroCopy: "WifiPlus 测量速度、延迟、DNS、丢包和 WiFi 健康，并与全球主要运营商对比。",
    startTest: "开始全球测试",
  },
  ja: {
    heroTitle: "世界中どこでもインターネット速度を測定",
    heroCopy:
      "WifiPlus は速度、遅延、DNS、パケット損失、WiFi 健康度を測定し、世界のプロバイダーと比較します。",
    startTest: "グローバルテスト開始",
  },
  ko: {
    heroTitle: "전 세계 어디서나 인터넷 속도 테스트",
    heroCopy:
      "WifiPlus는 속도, 지연, DNS, 패킷 손실, WiFi 상태를 측정하고 글로벌 제공업체와 비교합니다.",
    startTest: "글로벌 테스트 시작",
  },
  ru: {
    heroTitle: "Проверьте скорость интернета в любой стране",
    heroCopy:
      "WifiPlus измеряет скорость, задержку, DNS, потери пакетов и состояние WiFi, сравнивая результаты с мировыми провайдерами.",
    startTest: "Начать глобальный тест",
  },
  tr: {
    heroTitle: "Dünyanın her yerinde internet hızını test edin",
    heroCopy:
      "WifiPlus hız, gecikme, DNS, paket kaybı ve WiFi sağlığını ölçer, sonuçları küresel sağlayıcılarla karşılaştırır.",
    startTest: "Global testi başlat",
  },
  id: {
    heroTitle: "Uji kecepatan internet di mana saja",
    heroCopy:
      "WifiPlus mengukur kecepatan, latensi, DNS, packet loss, dan kesehatan WiFi, lalu membandingkan hasil dengan penyedia global.",
    startTest: "Mulai tes global",
  },
  bn: {
    heroTitle: "বিশ্বের যেকোনো জায়গায় ইন্টারনেট স্পিড টেস্ট করুন",
    heroCopy:
      "WifiPlus স্পিড, লেটেন্সি, DNS, প্যাকেট লস এবং WiFi স্বাস্থ্য মাপে এবং ফলাফল বিশ্বব্যাপী প্রদানকারীদের সঙ্গে তুলনা করে।",
    startTest: "গ্লোবাল টেস্ট শুরু করুন",
  },
  ur: {
    heroTitle: "دنیا میں کہیں بھی انٹرنیٹ اسپیڈ ٹیسٹ کریں",
    heroCopy:
      "WifiPlus رفتار، تاخیر، DNS، پیکٹ لاس اور WiFi صحت ناپتا ہے اور نتائج کا عالمی فراہم کنندگان سے موازنہ کرتا ہے۔",
    startTest: "گلوبل ٹیسٹ شروع کریں",
  },
} as const satisfies Record<string, Strings>;

export type Locale = keyof typeof translations;

export const localeNames: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  ar: "العربية",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  tr: "Türkçe",
  id: "Indonesia",
  bn: "বাংলা",
  ur: "اردو",
};

const RTL_LOCALES: Locale[] = ["ar", "ur"];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Persisted values are attacker-writable in a shared browser, so only ever
 * accept a locale we actually ship — nothing arbitrary reaches `<html lang>`.
 */
export function safeLocale(requested: string | null | undefined): Locale {
  return requested && Object.prototype.hasOwnProperty.call(translations, requested)
    ? (requested as Locale)
    : "en";
}
