import type { Locale } from "./config";

type HomeSection = {
  id: string;
  eyebrow: string;
  title: string;
  accent?: string;
  taglines?: string[];
  paragraphs: string[];
  actions: string[];
  image: string;
  alt: string;
  caption: string;
};

export const homeSections: Record<Locale, HomeSection[]> = {
  en: [
    {
      id: "introduction",
      eyebrow: "01 / Introduction",
      title: "THE FUTURE IS",
      accent: "LIVE.",
      taglines: ["TALENT. LIVE SHOWS. COMMERCE."],
      paragraphs: [
        "A global ecosystem bringing together creators, live entertainment, and brands.",
      ],
      actions: ["I am a streamer", "I am a brand"],
      image: "/images/creator-editorial.webp",
      alt: "A creator wearing headphones beside a studio microphone",
      caption: "Studio",
    },
    {
      id: "our-talent",
      eyebrow: "02 / Our Talent",
      title: "STREAMERS ARE CULTURE.",
      paragraphs: [
        "We discover emerging talent and help creators build their future through professional support, live experiences, and new opportunities.",
        "Our mission is to help creators build a future in live streaming from wherever they choose to go live.",
      ],
      actions: ["Join Stream Talents"],
      image: "/images/creator-at-home.webp",
      alt: "A creator streaming from her kitchen with a phone on a tripod",
      caption: "At home",
    },
    {
      id: "live-shows",
      eyebrow: "03 / Live Shows",
      title: "EVERY NICHE, LIVE.",
      paragraphs: [
        "Gaming. Finance. Lifestyle. Sports. Beauty. Cinema and more.",
        "Real personalities. Live entertainment. Global audiences.",
      ],
      actions: ["Explore Stream Talents"],
      image: "/images/beach-live.webp",
      alt: "A kite enthusiast livestreaming from the beach",
      caption: "On location",
    },
    {
      id: "for-brands",
      eyebrow: "04 / For Brands",
      title: "YOUR BRAND. OUR TALENT. LIVE SALES!",
      paragraphs: [
        "Bring your digital or physical products and services to life through our live hosts who engage audiences and turn live experiences into commercial opportunities.",
      ],
      actions: ["Partner With Us"],
      image: "/images/live-commerce.webp",
      alt: "Two hosts demonstrating a product on a shopping livestream",
      caption: "Live commerce",
    },
    {
      id: "academy",
      eyebrow: "05 / Stream Talents Academy",
      title: "STREAM TALENTS ACADEMY.",
      taglines: [
        "60 DAYS. PRO-STREAMER. A NEW BEGINNING.",
        "Learn. Create. Go live. Grow.",
      ],
      paragraphs: [
        "A structured development journey for the next generation of professional live creators.",
        "A digital learning program for TikTok LIVE.",
      ],
      actions: ["Explore the Academy"],
      image: "/images/academy-tiktok-live.webp",
      alt: "A creator taking an online livestreaming lesson and practicing with a phone on a tripod",
      caption: "TikTok LIVE training",
    },
    {
      id: "ecosystem",
      eyebrow: "06 / Our Ecosystem",
      title: "NOT JUST A TALENT AGENCY. A LIVE CREATOR ENGINE.",
      taglines: ["DISCOVER. DEVELOP. ACTIVATE. MONETIZE."],
      paragraphs: [
        "One connected ecosystem for talent development, live entertainment, and commerce.",
      ],
      actions: ["Our Technology"],
      image: "/images/creator-production.webp",
      alt: "A production team coordinating a livestream from a desk with multiple camera feeds",
      caption: "Behind the scenes",
    },
    {
      id: "the-future",
      eyebrow: "07 / The Future",
      title: "WE DON'T FOLLOW THE LIVE ERA. WE BUILD IT.",
      paragraphs: ["The next generation of live entertainment starts here."],
      actions: ["Become a Creator", "Partner With Us"],
      image: "/images/rooftop-live.webp",
      alt: "A creator livestreaming from a city rooftop at dusk",
      caption: "From the city",
    },
  ],
  es: [
    {
      id: "introduction",
      eyebrow: "01 / Introducción",
      title: "EL FUTURO ES",
      accent: "EN VIVO.",
      taglines: ["TALENTO. SHOWS EN VIVO. COMERCIO."],
      paragraphs: [
        "Un ecosistema global que reúne a creadores, entretenimiento en vivo y marcas.",
      ],
      actions: ["Soy streamer", "Soy una marca"],
      image: "/images/creator-editorial.webp",
      alt: "Una creadora con audífonos junto a un micrófono de estudio",
      caption: "En el estudio",
    },
    {
      id: "our-talent",
      eyebrow: "02 / Nuestro talento",
      title: "LOS STREAMERS SON CULTURA.",
      paragraphs: [
        "Descubrimos talento emergente y ayudamos a los creadores a construir su futuro con apoyo profesional, experiencias en vivo y nuevas oportunidades.",
        "Nuestra misión es ayudar a los creadores a construir su futuro en el streaming desde donde elijan transmitir.",
      ],
      actions: ["Únete a Stream Talents"],
      image: "/images/creator-at-home.webp",
      alt: "Una creadora transmite desde su cocina con un celular en un trípode",
      caption: "Desde casa",
    },
    {
      id: "live-shows",
      eyebrow: "03 / Shows en vivo",
      title: "TODOS LOS NICHOS, EN VIVO.",
      paragraphs: [
        "Gaming. Finanzas. Estilo de vida. Deportes. Belleza. Cine y más.",
        "Personalidades reales. Entretenimiento en vivo. Audiencias globales.",
      ],
      actions: ["Explora Stream Talents"],
      image: "/images/beach-live.webp",
      alt: "Un aficionado a las cometas transmite en vivo desde la playa",
      caption: "Al aire libre",
    },
    {
      id: "for-brands",
      eyebrow: "04 / Para marcas",
      title: "TU MARCA. NUESTRO TALENTO. ¡VENTAS EN VIVO!",
      paragraphs: [
        "Dale vida a tus productos y servicios digitales o físicos con nuestros anfitriones, que conectan con la audiencia y convierten las experiencias en vivo en oportunidades comerciales.",
      ],
      actions: ["Colabora con nosotros"],
      image: "/images/live-commerce.webp",
      alt: "Dos anfitriones muestran un producto durante una transmisión de compras",
      caption: "Comercio en vivo",
    },
    {
      id: "academy",
      eyebrow: "05 / Stream Talents Academy",
      title: "STREAM TALENTS ACADEMY.",
      taglines: [
        "60 DÍAS. STREAMER PROFESIONAL. UN NUEVO COMIENZO.",
        "Aprende. Crea. Sal en vivo. Crece.",
      ],
      paragraphs: [
        "Un programa de formación para la próxima generación de creadores profesionales en vivo.",
        "Un programa de aprendizaje digital para TikTok LIVE.",
      ],
      actions: ["Explora la Academy"],
      image: "/images/academy-tiktok-live.webp",
      alt: "Una creadora sigue una clase en línea y practica con un celular en un trípode",
      caption: "Formación en TikTok LIVE",
    },
    {
      id: "ecosystem",
      eyebrow: "06 / Nuestro ecosistema",
      title: "MÁS QUE UNA AGENCIA DE TALENTO. UN MOTOR PARA CREADORES EN VIVO.",
      taglines: ["DESCUBRIR. DESARROLLAR. ACTIVAR. MONETIZAR."],
      paragraphs: [
        "Un ecosistema que conecta el desarrollo de talento, el entretenimiento en vivo y el comercio.",
      ],
      actions: ["Nuestra tecnología"],
      image: "/images/creator-production.webp",
      alt: "Un equipo de producción coordina una transmisión con varias señales de cámara",
      caption: "Detrás de cámaras",
    },
    {
      id: "the-future",
      eyebrow: "07 / El futuro",
      title: "NO SEGUIMOS LA ERA DEL DIRECTO. LA CONSTRUIMOS.",
      paragraphs: [
        "La próxima generación del entretenimiento en vivo empieza aquí.",
      ],
      actions: ["Conviértete en creador", "Colabora con nosotros"],
      image: "/images/rooftop-live.webp",
      alt: "Una creadora transmite en vivo desde una azotea al atardecer",
      caption: "Desde la ciudad",
    },
  ],
};
