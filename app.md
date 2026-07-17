---
name: voicing-fco
description: "Voicing the Claim Ceiling — FCO/FCG custody graph where every agent action is a hash-addressed custody node, and the graph itself has a voice via ElevenLabs."
manifest_version: 1
enabled: true
visibility: public
---

# Voicing FCO

A Sauna App that turns FCO/FCG into a *spoken* custody chain.

Every agent action — text ingestion, ElevenLabs TTS, prompt resolution — is wrapped as a
Fractal Custody Object (FCO) with operational and content leaves, chained into a Fractal
Custody Graph (FCG) using RFC 6962 domain-separated Merkle hashing (leaf 0x00, node 0x01,
duplicate-last pairing). The graph is the memory. The graph has a voice.

This is the ElevenLabs × Sauna hack night demo, anchored in Byron P. Lee's preprint
*Fractal Custody Objects and Graphs for Efficient, Verifiable AI Training and
Computational Biology* (Zenodo submission packet, 2026-07-15).
