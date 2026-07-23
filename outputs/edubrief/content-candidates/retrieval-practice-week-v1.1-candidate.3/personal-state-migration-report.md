# Bericht zur Migration persönlicher Praxiszustände

Status: **PASS im implementierten Adaptervertrag**.

Alte `savedItems.wantToTryAt`- und `savedItems.triedAt`-Zeitstempel werden in einer IndexedDB-Transaktion auf genau die durch Content 1.0.0 bestimmte bisherige Primärumsetzung übertragen. Die stabile `impulseId` wird als `implementationId` weiterverwendet. Ziele sind `practicePlans` beziehungsweise `practiceExperiences`.

Nicht migriert wird auf neue Kandidatenvarianten oder auf alle Umsetzungen. Merken, Vertiefen, Fortschritt, Kalender, Profil und Offline-Content bleiben unverändert. Ein Marker in `personalMeta` macht die Migration idempotent. Der Kandidat selbst löst keine Migration aus, da er nicht installiert oder veröffentlicht wird.
