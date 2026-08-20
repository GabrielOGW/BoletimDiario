/**
 * O único global de navegador que a fronteira offline exige: `indexedDB`.
 *
 * `fake-indexeddb` é uma implementação real da especificação sobre memória — não um
 * dublê. Isso importa porque o que se quer provar aqui é justamente transação, índice
 * composto e upgrade versionado; contra um dublê, "a escrita local e a fila saem na
 * mesma transação" passaria sem haver transação nenhuma.
 */
import 'fake-indexeddb/auto';
