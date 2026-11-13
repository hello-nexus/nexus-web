/** True for the Stream Deck record of a Galleon keyboard, the one Corsair-branded deck. */
export const isGalleonDeck = (deck: { displayName: string }): boolean => deck.displayName.startsWith('Corsair ');
