import { CARD_SLOT_COUNT } from "../config";

export const CARD_SLOT_UNLOCK_CHAPTER_IDS = ["1", "2", "3"] as const;
export const INITIAL_CARD_SLOT_COUNT = CARD_SLOT_COUNT - CARD_SLOT_UNLOCK_CHAPTER_IDS.length;

export function cardSlotUnlockChapter(slotIndex: number) {
  return CARD_SLOT_UNLOCK_CHAPTER_IDS[slotIndex - INITIAL_CARD_SLOT_COUNT];
}
