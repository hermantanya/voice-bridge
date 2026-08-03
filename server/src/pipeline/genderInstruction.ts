export type SpeakerGender = "female" | "male";

function genderLabel(gender: SpeakerGender): string {
  return gender === "female" ? "female" : "male";
}

export function buildGenderInstruction(
  speakerGender?: SpeakerGender,
  addresseeGender?: SpeakerGender,
): string {
  const parts: string[] = [];

  if (speakerGender) {
    parts.push(
      `The speaker is ${genderLabel(speakerGender)} — in Hebrew and Russian use ${speakerGender} grammatical forms when the speaker is the subject (verbs, adjectives, past tense, first-person).`,
    );
  }

  if (addresseeGender) {
    parts.push(
      `The listener being spoken to is ${genderLabel(addresseeGender)} — in Hebrew and Russian use ${addresseeGender} grammatical forms for second-person address (you, your, imperative, verbs/adjectives referring to the listener).`,
    );
  }

  if (parts.length === 0) {
    return "";
  }

  return ` ${parts.join(" ")}`;
}
