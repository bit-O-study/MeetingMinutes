import { searchParts } from "./search-view";
import styles from "./Search.module.css";

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  return searchParts(text, query).map((part, index) => part.match
    ? <mark key={index} className={styles.highlight}>{part.text}</mark>
    : part.text);
}
