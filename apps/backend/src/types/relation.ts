// Wrapping an association type makes `emitDecoratorMetadata` emit `Object` instead of
// the class itself; a direct class reference hits the TDZ under ESM circular imports.
export type Relation<T> = T
