declare module "nspell" {
  interface Spell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }

  export default function nspell(aff: string, dic?: string): Spell;
}
