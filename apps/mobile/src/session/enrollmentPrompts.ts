import type { LanguageCode, SpeakerGender } from "../config";

export const MIN_ENROLLMENT_DURATION_MS = 30_000;

type EnrollmentPrompt = {
  title: string;
  paragraphs: string[];
};

const PROMPTS: Record<
  LanguageCode,
  Record<SpeakerGender, EnrollmentPrompt>
> = {
  en: {
    female: {
      title: "English enrollment script",
      paragraphs: [
        "Hello, this is my voice for Voice Bridge.",
        "I'm recording myself so the app can learn how I sound when I speak naturally — not too fast, and not too slow.",
        "Yesterday was a busy day. I woke up in the morning, had some coffee, and opened my laptop. I worked on a few things, talked with friends, and thought about my plans for the weekend.",
        "I love walking outside, reading, and meeting people. Sometimes I speak English, sometimes Hebrew, and sometimes a mix of both. That's just part of my everyday life.",
        "Technology should help us connect with each other — not get in the way. I hope this voice helps people talk together even when their languages are different.",
        "Thank you for listening. This is my real voice.",
      ],
    },
    male: {
      title: "English enrollment script",
      paragraphs: [
        "Hello, this is my voice for Voice Bridge.",
        "I'm recording myself so the app can learn how I sound when I speak naturally — not too fast, and not too slow.",
        "Yesterday was a busy day. I woke up in the morning, had some coffee, and opened my laptop. I worked on a few things, talked with friends, and thought about my plans for the weekend.",
        "I love walking outside, reading, and meeting people. Sometimes I speak English, sometimes Hebrew, and sometimes a mix of both. That's just part of my everyday life.",
        "Technology should help us connect with each other — not get in the way. I hope this voice helps people talk together even when their languages are different.",
        "Thank you for listening. This is my real voice.",
      ],
    },
  },
  he: {
    female: {
      title: "Hebrew enrollment script",
      paragraphs: [
        "שלום, זה הקול שלי עבור Voice Bridge.",
        "אני מקליטה את עצמי כדי שהאפליקציה תלמד איך אני נשמעת כשאני מדברת בצורה רגילה — לא מהר מדי, ולא לאט מדי.",
        "אתמול היה יום עמוס. קמתי בבוקר, שתיתי קפה, ופתחתי את המחשב. עבדתי על כמה דברים, דיברתי עם חברים, וחשבתי על התוכניות לסוף השבוע.",
        "אני אוהבת לטייל, לקרוא, ולפגוש אנשים. לפעמים אני מדברת עברית, לפעמים אנגלית, ולפעמים שילוב של שניהם. זה חלק מהחיים שלי.",
        "טכנולוגיה צריכה לעזור לנו להתחבר — לא להפריד. אני מקווה שהקול הזה יעזור לאנשים לדבר אחד עם השני, גם כשהשפות שונות.",
        "תודה שמקשיבים. זה הקול האמיתי שלי.",
      ],
    },
    male: {
      title: "Hebrew enrollment script",
      paragraphs: [
        "שלום, זה הקול שלי עבור Voice Bridge.",
        "אני מקליט את עצמי כדי שהאפליקציה תלמד איך אני נשמע כשאני מדבר בצורה רגילה — לא מהר מדי, ולא לאט מדי.",
        "אתמול היה יום עמוס. קמתי בבוקר, שתיתי קפה, ופתחתי את המחשב. עבדתי על כמה דברים, דיברתי עם חברים, וחשבתי על התוכניות לסוף השבוע.",
        "אני אוהב לטייל, לקרוא, ולפגוש אנשים. לפעמים אני מדבר עברית, לפעמים אנגלית, ולפעמים שילוב של שניהם. זה חלק מהחיים שלי.",
        "טכנולוגיה צריכה לעזור לנו להתחבר — לא להפריד. אני מקווה שהקול הזה יעזור לאנשים לדבר אחד עם השני, גם כשהשפות שונות.",
        "תודה שמקשיבים. זה הקול האמיתי שלי.",
      ],
    },
  },
  ru: {
    female: {
      title: "Russian enrollment script",
      paragraphs: [
        "Привет, это мой голос для Voice Bridge.",
        "Я записываю себя, чтобы приложение узнало, как я звучу, когда говорю естественно — не слишком быстро и не слишком медленно.",
        "Вчера был насыщенный день. Я проснулась утром, выпила кофе и открыла ноутбук. Я поработала над несколькими делами, поговорила с друзьями и подумала о планах на выходные.",
        "Мне нравится гулять, читать и встречаться с людьми. Иногда я говорю по-русски, иногда по-английски, а иногда смешиваю оба языка. Так устроена моя повседневная жизнь.",
        "Технологии должны помогать людям общаться друг с другом, а не мешать. Я надеюсь, что этот голос поможет людям разговаривать, даже когда их языки разные.",
        "Спасибо, что слушаете. Это мой настоящий голос.",
      ],
    },
    male: {
      title: "Russian enrollment script",
      paragraphs: [
        "Привет, это мой голос для Voice Bridge.",
        "Я записываю себя, чтобы приложение узнало, как я звучу, когда говорю естественно — не слишком быстро и не слишком медленно.",
        "Вчера был насыщенный день. Я проснулся утром, выпил кофе и открыл ноутбук. Я поработал над несколькими делами, поговорил с друзьями и подумал о планах на выходные.",
        "Мне нравится гулять, читать и встречаться с людьми. Иногда я говорю по-русски, иногда по-английски, а иногда смешиваю оба языка. Так устроена моя повседневная жизнь.",
        "Технологии должны помогать людям общаться друг с другом, а не мешать. Я надеюсь, что этот голос поможет людям разговаривать, даже когда их языки разные.",
        "Спасибо, что слушаете. Это мой настоящий голос.",
      ],
    },
  },
};

export function getEnrollmentPrompt(
  language: LanguageCode,
  gender: SpeakerGender,
): EnrollmentPrompt {
  return PROMPTS[language][gender];
}

export function estimatedEnrollmentReadSeconds(
  language: LanguageCode,
  gender: SpeakerGender,
): number {
  const prompt = getEnrollmentPrompt(language, gender);
  const words = prompt.paragraphs.join(" ").split(/\s+/).length;
  if (language === "he" || language === "ru") {
    return Math.max(45, Math.round(words / 2.2));
  }
  return Math.max(45, Math.round(words / 2.5));
}

export function formatEnrollmentDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function hasMinimumEnrollmentDuration(ms: number): boolean {
  return ms >= MIN_ENROLLMENT_DURATION_MS;
}

export function enrollmentDurationHint(ms: number): string {
  if (hasMinimumEnrollmentDuration(ms)) {
    return "Ready to create your voice";
  }

  const remainingSeconds = Math.ceil(
    (MIN_ENROLLMENT_DURATION_MS - ms) / 1000,
  );
  return `Keep reading — about ${remainingSeconds}s more needed`;
}
