/**
 * Translated landing pages.
 * -----------------------------------------------------------------------------
 * The app already carries 15 UI languages, but they are switched client-side
 * from localStorage: one URL, one language as far as a crawler is concerned, so
 * none of that work is indexable. A locale only becomes a search asset when it
 * has its own URL, its own translated content and an hreflang cluster pointing
 * at its siblings.
 *
 * Deliberately not all fifteen. Bulk machine translation of technical content is
 * a spam-policy risk and reads badly to the people it is supposedly for — a
 * locale earns a page when the page is genuinely written in that language. Two
 * are done properly here; the generator handles any number, so adding the next
 * one means adding content, not code.
 *
 * Slugs are localised too: `/es/test-de-bufferbloat/` matches what a Spanish
 * speaker actually types far better than `/es/bufferbloat-test/`.
 */

/** Locales that get generated pages. `en` is the canonical source in pages.mjs. */
export const LOCALES = {
  es: { code: "es", hreflang: "es", name: "Español", dir: "ltr" },
  hi: { code: "hi", hreflang: "hi", name: "हिन्दी", dir: "ltr" },
};

/**
 * Chrome and boilerplate, per locale. `en` doubles as the fallback for any
 * string a new locale has not translated yet.
 */
export const UI = {
  en: {
    skip: "Skip to content",
    fullTest: "Full test",
    home: "Home",
    go: "GO",
    again: "AGAIN",
    caption: "Press GO — about 6 seconds, no signup.",
    ready: "Ready.",
    faqHeading: "Frequently asked questions",
    relatedHeading: "Related tests",
    cta: "Run the full test — every metric in one pass →",
    footer: "WifiPlus — real measurement, no signup, no ads.",
    otherLanguages: "Other languages",
    metrics: {
      download: "Download",
      upload: "Upload",
      ping: "Ping",
      jitter: "Jitter",
      loss: "Packet loss",
      dns: "DNS",
      bufferbloat: "Bufferbloat",
      stability: "Stability",
      grade: "grade",
    },
    phases: {
      ping: "PING",
      download: "DOWNLOAD",
      upload: "UPLOAD",
    },
    status: {
      latency: "Measuring ping, jitter, packet loss and DNS…",
      download: "Measuring download and latency under load…",
      upload: "Measuring upload…",
      failed: "Test failed. Check your connection and try again.",
    },
    // Verdicts mirror core/scoring.js bufferbloatVerdict, which is English-only
    // because it is shared with the app shell. The thresholds stay in core; only
    // the wording is per-locale.
    verdicts: {
      good: "Your router keeps queues short. Calls and games hold up while other devices download.",
      queueing: "Noticeable queueing. Enabling Smart Queue Management (SQM/fq_codel) on your router would fix this.",
      severe: "Severe bufferbloat. Calls will break up whenever anyone else downloads — a router queue problem, not a speed problem.",
    },
  },

  es: {
    skip: "Ir al contenido",
    fullTest: "Test completo",
    home: "Inicio",
    go: "INICIAR",
    again: "REPETIR",
    caption: "Pulsa INICIAR — unos 6 segundos, sin registro.",
    ready: "Listo.",
    faqHeading: "Preguntas frecuentes",
    relatedHeading: "Pruebas relacionadas",
    cta: "Ejecutar el test completo — todas las métricas de una vez →",
    footer: "WifiPlus — medición real, sin registro, sin anuncios.",
    otherLanguages: "Otros idiomas",
    metrics: {
      download: "Descarga",
      upload: "Subida",
      ping: "Ping",
      jitter: "Jitter",
      loss: "Pérdida de paquetes",
      dns: "DNS",
      bufferbloat: "Bufferbloat",
      stability: "Estabilidad",
      grade: "nota",
    },
    phases: {
      ping: "PING",
      download: "DESCARGA",
      upload: "SUBIDA",
    },
    status: {
      latency: "Midiendo ping, jitter, pérdida de paquetes y DNS…",
      download: "Midiendo descarga y latencia bajo carga…",
      upload: "Midiendo subida…",
      failed: "La prueba falló. Revisa tu conexión e inténtalo de nuevo.",
    },
    verdicts: {
      good: "Tu router mantiene las colas cortas. Las llamadas y los juegos aguantan mientras otros descargan.",
      queueing: "Hay encolado apreciable. Activar la gestión inteligente de colas (SQM/fq_codel) en tu router lo resolvería.",
      severe: "Bufferbloat severo. Las llamadas se cortarán cada vez que alguien descargue: es un problema de colas del router, no de velocidad.",
    },
  },

  hi: {
    skip: "सामग्री पर जाएँ",
    fullTest: "पूरा टेस्ट",
    home: "होम",
    go: "शुरू करें",
    again: "फिर से",
    caption: "शुरू करें दबाएँ — लगभग 6 सेकंड, कोई साइनअप नहीं।",
    ready: "तैयार।",
    faqHeading: "अक्सर पूछे जाने वाले प्रश्न",
    relatedHeading: "संबंधित टेस्ट",
    cta: "पूरा टेस्ट चलाएँ — सभी माप एक साथ →",
    footer: "WifiPlus — वास्तविक माप, कोई साइनअप नहीं, कोई विज्ञापन नहीं।",
    otherLanguages: "अन्य भाषाएँ",
    metrics: {
      download: "डाउनलोड",
      upload: "अपलोड",
      ping: "पिंग",
      jitter: "जिटर",
      loss: "पैकेट लॉस",
      dns: "DNS",
      bufferbloat: "बफ़रब्लोट",
      stability: "स्थिरता",
      grade: "ग्रेड",
    },
    phases: {
      ping: "पिंग",
      download: "डाउनलोड",
      upload: "अपलोड",
    },
    status: {
      latency: "पिंग, जिटर, पैकेट लॉस और DNS मापा जा रहा है…",
      download: "डाउनलोड और लोड में लेटेंसी मापी जा रही है…",
      upload: "अपलोड मापा जा रहा है…",
      failed: "टेस्ट विफल रहा। अपना कनेक्शन जाँचें और दोबारा कोशिश करें।",
    },
    verdicts: {
      good: "आपका राउटर कतारें छोटी रखता है। दूसरों के डाउनलोड के दौरान भी कॉल और गेम ठीक चलेंगे।",
      queueing: "ध्यान देने लायक कतार है। राउटर में स्मार्ट क्यू मैनेजमेंट (SQM/fq_codel) चालू करने से यह ठीक हो जाएगा।",
      severe: "गंभीर बफ़रब्लोट। जब भी कोई डाउनलोड करेगा, कॉल टूटेगी — यह राउटर की कतार की समस्या है, स्पीड की नहीं।",
    },
  },
};

/**
 * Page content per locale, keyed by the English slug it translates.
 * Shape matches SeoPage: slug (localised), title, description, h1, standfirst,
 * intro[], sections[], faq[].
 */
export const TRANSLATIONS = {
  es: {
    "bufferbloat-test": {
      slug: "test-de-bufferbloat",
      title: "Test de Bufferbloat — Latencia bajo carga, de A+ a F | WifiPlus",
      description:
        "Test de bufferbloat gratuito: mide cuánto sube tu latencia mientras la conexión está saturada, con nota de A+ a F. Explica por qué se cortan las videollamadas.",
      h1: "Test de bufferbloat",
      standfirst:
        "Esta es la medición que explica por qué tu videollamada se rompe en cuanto alguien empieza a descargar.",
      intro: [
        "El bufferbloat ocurre cuando un equipo de red retiene muchos más datos de los que debería. Como la memoria es barata, los routers y módems se fabricaron con búferes enormes, partiendo de la idea de que retener un paquete siempre es mejor que descartarlo. El resultado fue el contrario del buscado: cuando el enlace se llena, ese búfer también se llena, y cada paquete que llega después espera en una cola que puede durar segundos.",
        "El síntoma es inconfundible una vez que lo reconoces. Todo funciona bien hasta que alguien inicia una descarga o una subida grande, y entonces las llamadas se entrecortan, las páginas se quedan colgadas y los juegos se vuelven injugables — mientras un test de velocidad ejecutado en ese mismo momento sigue mostrando toda la velocidad contratada. La banda ancha nunca fue el problema. La cola sí.",
      ],
      sections: [
        {
          heading: "Cómo lo mide esta prueba",
          body: "Primero se mide la latencia en reposo, con la conexión descargada. Después se vuelve a medir durante la descarga real, mientras el enlace está genuinamente saturado por el tráfico de la propia prueba. La diferencia entre esas dos medianas es tu bufferbloat, y se califica de A+ (menos de 5 ms añadidos) a F (más de 200 ms). Medir durante la descarga real y no con una carga artificial significa que el resultado refleja una situación que tu conexión vive de verdad.",
        },
        {
          heading: "Qué significa cada nota",
          body: "A+ o A: tu router mantiene las colas cortas y tus llamadas sobrevivirán a las descargas de los demás. B o C: hay encolado apreciable y lo notarás en videollamadas. D o F: tu latencia se multiplica bajo carga — una conexión de 20 ms que pasa a 500 ms en cuanto alguien descarga — y ninguna mejora de velocidad lo va a arreglar, porque el límite es la cola, no la capacidad.",
        },
        {
          heading: "Cómo solucionarlo",
          body: "La solución es la gestión inteligente de colas: un algoritmo como fq_codel o CAKE que mantiene las colas cortas y reparte el enlace de forma justa entre conexiones. Muchos routers modernos lo incluyen bajo nombres como SQM, Smart Queues, control de bufferbloat o QoS adaptativo, y OpenWrt lo soporta por completo. Configurarlo consiste en activar SQM e indicarle la velocidad real de tu línea, declarándola ligeramente por debajo para que la cola se forme en tu router —donde el algoritmo la controla— y no en el equipo de tu operador, donde no la controla nadie.",
        },
      ],
      faq: [
        {
          q: "¿Qué es el bufferbloat?",
          a: "Latencia excesiva causada por búferes de red sobredimensionados. Cuando el enlace se satura, los paquetes se acumulan en esos búferes en lugar de descartarse, así que el retardo pasa de milisegundos a cientos de milisegundos mientras la velocidad sigue alta.",
        },
        {
          q: "¿Cómo sé si tengo bufferbloat?",
          a: "Ejecuta esta prueba. Si tu latencia bajo carga es muy superior a la latencia en reposo — una nota de C o peor — lo tienes. La señal cotidiana es que las llamadas y los juegos fallan justo cuando alguien de casa está descargando.",
        },
        {
          q: "¿Contratar más velocidad soluciona el bufferbloat?",
          a: "No. Una línea más rápida llena sus búferes igual de completamente, solo que antes. La solución es la gestión de colas, no la capacidad, y por eso subir de tarifa tan a menudo no resuelve el problema por el que se subió.",
        },
        {
          q: "¿Qué nota de bufferbloat es buena?",
          a: "A+ o A. Significa menos de 30 ms añadidos con el enlace saturado, suficiente para que las aplicaciones en tiempo real sigan siendo usables pase lo que pase.",
        },
      ],
    },

    "wifi-speed-test": {
      slug: "test-de-velocidad-wifi",
      title: "Test de Velocidad WiFi — Mide tu velocidad real | WifiPlus",
      description:
        "Test de velocidad WiFi gratuito que mide descarga, subida, ping y pérdida de paquetes reales en tu navegador. Sin aplicación y sin registro.",
      h1: "Test de velocidad WiFi",
      standfirst:
        "Mide lo que tu conexión inalámbrica entrega de verdad ahora mismo, no lo que promete la tarifa.",
      intro: [
        "Un test de velocidad WiFi mide la conexión entre tu dispositivo e internet atravesando el salto inalámbrico que hay en medio. Esa distinción importa más de lo que parece: tu línea de banda ancha puede estar perfectamente sana mientras el WiFi que tienes delante desperdicia la mitad de la velocidad que pagas.",
        "Esta prueba mueve datos reales por tu conexión y los cronometra. Abre ocho flujos en paralelo hacia el nodo más cercano, descarta el primer medio segundo mientras la ventana de congestión arranca, y reporta la velocidad sostenida durante el resto de la ventana. Por eso el número se estabiliza en lugar de dispararse — el pico es el arranque, y publicarlo sería adular a tu conexión.",
      ],
      sections: [
        {
          heading: "Por qué tu WiFi va más lento que tu tarifa",
          body: "El medio inalámbrico es compartido y half-duplex: todos los dispositivos de la banda se turnan, y cada uno que esté lejos del router o atrapado en 2,4 GHz ralentiza los turnos de los demás. La distancia, las paredes, las redes vecinas en el mismo canal y los equipos antiguos que obligan al punto de acceso a bajar de velocidad se llevan su parte. Medir 90 Mbps por WiFi en una tarifa de 300 Mbps casi siempre significa que la línea está bien y el cuello de botella es el salto inalámbrico — que es justo la parte que sí puedes arreglar.",
        },
        {
          heading: "Prueba con WiFi y después con cable",
          body: "La forma más rápida de separar ambas cosas es ejecutar la prueba dos veces: una por WiFi y otra con un cable Ethernet al mismo router. Si el resultado por cable se acerca a tu tarifa y el inalámbrico no, el problema es la ubicación, el canal o la banda, no tu operador. Si ambos son bajos, el límite es la línea y ningún ajuste del router lo va a cambiar.",
        },
        {
          heading: "Qué es un buen resultado",
          body: "Para navegar y ver vídeo manda la descarga sostenida. Para videollamadas y copias en la nube importa más la subida, que suele ser una fracción de la descarga. Para juegos y llamadas no decide ninguna de las dos: deciden la latencia, el jitter y la latencia bajo carga, y por eso esta prueba las mide todas en la misma ejecución en lugar de dar solo una cifra de velocidad.",
        },
      ],
      faq: [
        {
          q: "¿Por qué mi test de velocidad WiFi es más lento que mi tarifa?",
          a: "El salto inalámbrico entre tu dispositivo y el router es casi siempre la parte más estrecha del camino. Distancia, paredes, saturación de 2,4 GHz y dispositivos antiguos reducen la velocidad sostenible. Probar con cable Ethernet te dice si la culpa es de la línea o del WiFi.",
        },
        {
          q: "¿Es fiable un test de velocidad en el navegador?",
          a: "Para el enlace, sí: mide datos realmente transferidos por tu conexión real. Lo que no puede separar son los límites de tu propio equipo — una tarjeta WiFi antigua, una CPU ocupada o una VPN reducirán el resultado por debajo de lo que la línea podría dar.",
        },
        {
          q: "¿Cuántas veces debo hacer la prueba?",
          a: "Dos o tres veces con unos minutos de diferencia. Un único resultado captura un instante, y los medios compartidos como el WiFi y el cable varían minuto a minuto. La coherencia entre ejecuciones dice mucho más que una cifra alta aislada.",
        },
        {
          q: "¿Esta prueba consume datos?",
          a: "Sí. Medir velocidad exige mover datos reales: entre 50 y 150 MB aproximadamente según lo rápida que sea tu conexión. En una tarifa móvil con límite, úsala con moderación.",
        },
      ],
    },
  },

  hi: {
    "bufferbloat-test": {
      slug: "bufferbloat-test",
      title: "बफ़रब्लोट टेस्ट — लोड में लेटेंसी, A+ से F तक ग्रेड | WifiPlus",
      description:
        "मुफ़्त बफ़रब्लोट टेस्ट: कनेक्शन पूरी तरह व्यस्त होने पर आपकी लेटेंसी कितनी बढ़ती है, A+ से F तक ग्रेड के साथ। यही कारण है कि डाउनलोड के समय कॉल टूटती है।",
      h1: "बफ़रब्लोट टेस्ट",
      standfirst:
        "यही वह माप है जो बताता है कि घर में कोई डाउनलोड शुरू करते ही आपकी कॉल क्यों टूटने लगती है।",
      intro: [
        "बफ़रब्लोट तब होता है जब कोई नेटवर्क उपकरण ज़रूरत से कहीं ज़्यादा डेटा अपने पास रोक लेता है। मेमोरी सस्ती है, इसलिए राउटर और मॉडेम बड़े बफ़र के साथ बनाए गए — इस सोच के साथ कि पैकेट रोक लेना उसे गिरा देने से बेहतर है। नतीजा उल्टा निकला: जैसे ही लिंक भरता है, वह बफ़र भी भर जाता है, और उसके पीछे आने वाला हर पैकेट एक ऐसी कतार में इंतज़ार करता है जो कई सेकंड लंबी हो सकती है।",
        "एक बार पहचान लेने के बाद यह लक्षण साफ़ दिखता है। सब ठीक चलता रहता है, फिर कोई बड़ा डाउनलोड या अपलोड शुरू करता है और कॉल अटकने लगती है, पेज लटक जाते हैं और गेम खेलने लायक नहीं रहते — जबकि उसी समय चलाया गया स्पीड टेस्ट पूरी विज्ञापित स्पीड दिखाता रहता है। समस्या कभी बैंडविड्थ थी ही नहीं। समस्या कतार थी।",
      ],
      sections: [
        {
          heading: "यह टेस्ट इसे कैसे मापता है",
          body: "पहले खाली कनेक्शन पर लेटेंसी मापी जाती है। फिर असली डाउनलोड के दौरान दोबारा मापी जाती है, जब लिंक टेस्ट के अपने ट्रैफ़िक से सचमुच भरा हुआ होता है। इन दोनों मीडियन का अंतर ही आपका बफ़रब्लोट है, और इसे A+ (5 ms से कम बढ़ोतरी) से F (200 ms से ज़्यादा) तक ग्रेड दिया जाता है। नकली लोड के बजाय असली डाउनलोड के दौरान मापने का मतलब है कि नतीजा उसी स्थिति को दिखाता है जिससे आपका कनेक्शन रोज़ गुज़रता है।",
        },
        {
          heading: "ग्रेड का मतलब क्या है",
          body: "A+ या A का मतलब है कि आपका राउटर कतारें छोटी रखता है और दूसरों के डाउनलोड के बीच भी आपकी कॉल टिकी रहेगी। B या C का मतलब है ध्यान देने लायक कतार, जो वीडियो कॉल में महसूस होगी। D या F का मतलब है कि लोड पड़ते ही आपकी लेटेंसी कई गुना हो जाती है — 20 ms का कनेक्शन किसी के डाउनलोड करते ही 500 ms — और कोई भी स्पीड अपग्रेड इसे ठीक नहीं करेगा, क्योंकि रुकावट क्षमता नहीं, कतार है।",
        },
        {
          heading: "इसे ठीक कैसे करें",
          body: "समाधान है स्मार्ट क्यू मैनेजमेंट: fq_codel या CAKE जैसा एल्गोरिदम जो कतारें छोटी रखता है और लिंक को कनेक्शनों के बीच निष्पक्ष रूप से बाँटता है। कई आधुनिक राउटर इसे SQM, Smart Queues, बफ़रब्लोट कंट्रोल या Adaptive QoS जैसे नामों से देते हैं, और OpenWrt इसे पूरी तरह सपोर्ट करता है। सेटअप का मतलब है SQM चालू करना और अपनी लाइन की असली स्पीड बताना — थोड़ी कम बताएँ, ताकि कतार आपके राउटर में बने जहाँ स्मार्ट एल्गोरिदम उसे नियंत्रित करता है, न कि आपके प्रदाता के उपकरण में जहाँ कोई नियंत्रण नहीं होता।",
        },
      ],
      faq: [
        {
          q: "बफ़रब्लोट क्या है?",
          a: "बहुत बड़े नेटवर्क बफ़र के कारण होने वाली अतिरिक्त देरी। लिंक भरने पर पैकेट गिराए जाने के बजाय उन बफ़रों में जमा होते रहते हैं, इसलिए देरी मिलीसेकंड से बढ़कर सैकड़ों मिलीसेकंड हो जाती है जबकि स्पीड ऊँची बनी रहती है।",
        },
        {
          q: "मुझे कैसे पता चलेगा कि मेरे कनेक्शन में बफ़रब्लोट है?",
          a: "यह टेस्ट चलाइए। अगर लोड के समय आपकी लेटेंसी खाली समय की लेटेंसी से बहुत ज़्यादा है — यानी ग्रेड C या उससे खराब — तो आपके कनेक्शन में बफ़रब्लोट है। रोज़मर्रा का संकेत यही है कि घर में कोई डाउनलोड करते ही कॉल और गेम बिगड़ जाते हैं।",
        },
        {
          q: "क्या ज़्यादा स्पीड का प्लान बफ़रब्लोट ठीक कर देगा?",
          a: "नहीं। तेज़ प्लान अपने बफ़र उतनी ही पूरी तरह भरता है, बस ज़्यादा जल्दी। समाधान क्षमता नहीं बल्कि कतार प्रबंधन है — इसीलिए प्लान अपग्रेड करने से अक्सर वह समस्या हल नहीं होती जिसके लिए अपग्रेड किया गया था।",
        },
      ],
    },

    "wifi-speed-test": {
      slug: "wifi-speed-test",
      title: "WiFi स्पीड टेस्ट — अपनी असली वायरलेस स्पीड मापें | WifiPlus",
      description:
        "मुफ़्त WiFi स्पीड टेस्ट जो आपके ब्राउज़र में असली डाउनलोड, अपलोड, पिंग और पैकेट लॉस मापता है। कोई ऐप नहीं, कोई साइनअप नहीं।",
      h1: "WiFi स्पीड टेस्ट",
      standfirst:
        "अभी आपका वायरलेस कनेक्शन सचमुच कितना दे रहा है, यह मापिए — न कि प्लान क्या वादा करता है।",
      intro: [
        "WiFi स्पीड टेस्ट आपके डिवाइस और इंटरनेट के बीच की कनेक्शन को बीच के वायरलेस हिस्से सहित मापता है। यह फ़र्क़ लोगों की अपेक्षा से कहीं ज़्यादा मायने रखता है: आपकी ब्रॉडबैंड लाइन पूरी तरह ठीक हो सकती है, जबकि सामने बैठा WiFi आपकी आधी स्पीड निगल रहा हो, जिसका पैसा आप दे रहे हैं।",
        "यह टेस्ट आपके कनेक्शन पर असली डेटा भेजता है और उसका समय मापता है। यह निकटतम एज नोड तक आठ समानांतर स्ट्रीम खोलता है, शुरुआती आधे सेकंड को छोड़ देता है जब कंजेशन विंडो बढ़ रही होती है, और बाकी समय की स्थिर गति बताता है। इसीलिए संख्या उछलने के बजाय स्थिर होती है — उछाल केवल शुरुआत है, और उसे दिखाना आपके कनेक्शन की झूठी तारीफ़ होगी।",
      ],
      sections: [
        {
          heading: "आपका WiFi आपके प्लान से धीमा क्यों है",
          body: "वायरलेस एक साझा माध्यम है जहाँ एक समय में एक ही दिशा में संचार होता है। बैंड पर मौजूद हर डिवाइस बारी-बारी से चलता है, और राउटर से दूर बैठा या 2.4 GHz पर अटका हर डिवाइस सबकी बारी धीमी कर देता है। दूरी, दीवारें, एक ही चैनल पर पड़ोसी नेटवर्क और पुराने डिवाइस — सब अपना हिस्सा लेते हैं। 300 Mbps के प्लान पर WiFi से 90 Mbps मिलना आमतौर पर यही बताता है कि लाइन ठीक है और अड़चन वायरलेस हिस्से में है — और यही वह हिस्सा है जिसे आप सुधार सकते हैं।",
        },
        {
          heading: "पहले WiFi पर, फिर केबल पर टेस्ट करें",
          body: "दोनों को अलग करने का सबसे तेज़ तरीका है टेस्ट दो बार चलाना: एक बार WiFi पर और एक बार उसी राउटर से ईथरनेट केबल जोड़कर। अगर केबल वाला नतीजा आपके प्लान के करीब है और वायरलेस वाला नहीं, तो समस्या राउटर की जगह, चैनल या बैंड की है — आपके प्रदाता की नहीं। अगर दोनों कम हैं, तो सीमा लाइन की है और राउटर की कोई सेटिंग उसे नहीं बदलेगी।",
        },
        {
          heading: "अच्छा नतीजा कैसा दिखता है",
          body: "स्ट्रीमिंग और ब्राउज़िंग के लिए स्थिर डाउनलोड सबसे अहम है। वीडियो कॉल और क्लाउड बैकअप के लिए अपलोड ज़्यादा मायने रखता है, जो आमतौर पर डाउनलोड का एक हिस्सा भर होता है। गेम और कॉल के लिए इनमें से कोई भी निर्णायक नहीं — वहाँ लेटेंसी, जिटर और लोड में लेटेंसी तय करती है, इसीलिए यह टेस्ट सब कुछ एक ही बार में मापता है, केवल एक स्पीड की संख्या नहीं देता।",
        },
      ],
      faq: [
        {
          q: "मेरा WiFi स्पीड टेस्ट मेरे प्लान से धीमा क्यों आता है?",
          a: "आपके डिवाइस और राउटर के बीच का वायरलेस हिस्सा लगभग हमेशा रास्ते का सबसे सँकरा भाग होता है। दूरी, दीवारें, 2.4 GHz की भीड़ और पुराने डिवाइस सब गति घटाते हैं। ईथरनेट केबल पर टेस्ट करने से पता चलता है कि दोष लाइन का है या WiFi का।",
        },
        {
          q: "क्या ब्राउज़र का स्पीड टेस्ट सही नतीजे देता है?",
          a: "लिंक के लिए हाँ — यह आपके असली कनेक्शन पर सचमुच भेजा गया डेटा मापता है। जो यह अलग नहीं कर सकता वह है आपके अपने डिवाइस की सीमाएँ: पुराना वायरलेस कार्ड, व्यस्त CPU या VPN नतीजे को लाइन की क्षमता से नीचे रखेंगे।",
        },
        {
          q: "मुझे कितनी बार टेस्ट करना चाहिए?",
          a: "कुछ मिनटों के अंतर पर दो या तीन बार। एक नतीजा सिर्फ़ एक पल दिखाता है, और WiFi तथा केबल जैसे साझा माध्यम मिनट-दर-मिनट बदलते हैं। कई बार के मिलते-जुलते नतीजे एक ऊँची संख्या से कहीं ज़्यादा अर्थपूर्ण हैं।",
        },
      ],
    },
  },
};
