export const VIEW_WIDTH = 200;
export const VIEW_HEIGHT = 430;

export const ARM_ROTATION = 'rotate(13 50 119)';

const HEAD = 'M100 12 C86 12 79 24 79 38 C79 54 88 64 100 64 C112 64 121 54 121 38 C121 24 114 12 100 12 Z';
const HAND = 'M43 211 C39 219 39 231 44 238 C48 243 55 242 57 236 C59 228 58 218 56 211 Z M43 214 C37 218 34 224 35 230 C37 233 40 232 41 228 C42 224 43 220 45 216 Z';

export const NEUTRAL_FRONT = [
  { d: HEAD, mirror: false },
  { d: 'M91 58 L109 58 L111 76 L89 76 Z', mirror: false },
  { d: HAND, part: 'arm', zone: 'upper' },
  { d: 'M86 200 C92 210 97 220 100 228 L100 204 Z', zone: 'lower' },
  { d: 'M70 302 C66 310 68 322 76 326 C84 328 89 320 88 310 C87 302 76 298 70 302 Z', zone: 'lower' },
  { d: 'M74 326 C75 348 72 372 72 398 L87 398 C87 376 85 350 82 326 Z', zone: 'lower' },
  { d: 'M70 398 C66 406 68 414 78 416 C88 417 92 410 88 402 C85 397 75 395 70 398 Z', zone: 'lower' },
];

export const NEUTRAL_BACK = [
  { d: HEAD, mirror: false },
  { d: 'M91 58 L109 58 L110 66 L90 66 Z', mirror: false },
  { d: HAND, part: 'arm', zone: 'upper' },
  { d: 'M50.5 134 C54.5 137 56.5 150 56 163 C53 165 48 165 45 163 C44.5 150 46.5 137 50.5 134 Z', part: 'arm', zone: 'upper' },
  { d: 'M70 306 C66 312 68 318 76 320 C84 321 89 316 88 310 C87 304 76 302 70 306 Z', zone: 'lower' },
  { d: 'M74 398 C70 406 70 414 78 416 C88 417 92 410 88 402 C85 397 79 395 74 398 Z', zone: 'lower' },
];

export const FRONT = [
  { key: 'traps_upper', zone: 'upper', d: 'M92 66 C86 72 76 77 64 80 C70 84 80 84 88 82 C92 78 94 72 94 67 Z' },
  { key: 'delts_side', zone: 'upper', d: 'M55 82 C47 86 42 94 41 103 C40 111 41 117 43 122 C45 122 47 121 49 120 C47 108 49 94 55 82 Z' },
  { key: 'delts_front', zone: 'upper', d: 'M55 82 C49 94 47 108 50 119 C52 122 55 122 57 118 C60 108 62 98 64 92 C66 88 68 84 66 80 C62 80 58 81 55 82 Z' },
  { key: 'chest_upper', zone: 'upper', d: 'M99 84 C88 82 74 84 65 92 C63 94 62 96 62 98 L99 98 Z' },
  { key: 'chest_mid', zone: 'upper', d: 'M99 98 L62 98 C61 104 61 110 63 114 L99 114 Z' },
  { key: 'chest_lower', zone: 'upper', d: 'M99 114 L63 114 C65 124 74 131 86 132 C92 132 97 131 99 129 Z' },
  { key: 'lats', zone: 'upper', d: 'M63 116 C61 126 62 138 66 148 C67 151 68 153 70 154 C69 146 69 138 70 132 C68 126 66 120 63 116 Z' },
  { key: 'biceps', zone: 'upper', part: 'arm', d: 'M55 119 C50 128 48 141 49 153 C50 160 56 163 59 159 C63 150 63 138 61 127 C60 121 57 118 55 119 Z' },
  { key: 'brachialis', zone: 'upper', part: 'arm', d: 'M50 122 C45 125 42 133 41 143 C40 152 42 159 45 161 C47 162 48 160 48 157 C46 147 46 134 50 124 C51 123 51 122 50 122 Z' },
  { key: 'brachioradialis', zone: 'upper', part: 'arm', d: 'M44 164 C38 176 38 192 42 208 L48 210 C46 196 46 180 50 166 Z' },
  { key: 'forearm_flexors', zone: 'upper', part: 'arm', d: 'M50 166 C47 180 47 196 49 210 L56 210 C59 196 60 180 58 166 C55 164 52 164 50 166 Z' },
  { key: 'abs_rectus', zone: 'upper', d: 'M99 135 L90 135 C89 140 89 145 89 149 L99 149 Z' },
  { key: 'abs_rectus', zone: 'upper', d: 'M99 152 L89 152 L89 166 L99 166 Z' },
  { key: 'abs_rectus', zone: 'upper', d: 'M99 169 L89 169 L89 183 L99 183 Z' },
  { key: 'abs_rectus', zone: 'upper', d: 'M99 186 L89 186 C89 194 91 200 99 206 Z' },
  { key: 'obliques', zone: 'upper', d: 'M87 136 C80 138 74 142 71 150 C70 164 73 180 80 192 C82 196 85 199 87 201 C86 180 86 156 87 136 Z' },
  { key: 'glute_med', zone: 'lower', d: 'M76 188 C69 195 66 203 66 212 L72 210 C72 202 74 195 78 191 Z' },
  { key: 'vastus_lateralis', zone: 'lower', d: 'M66 214 C56 232 54 264 60 290 C63 300 70 302 73 296 C70 272 71 246 76 220 C73 216 70 214 66 214 Z' },
  { key: 'rectus_femoris', zone: 'lower', d: 'M77 218 C72 242 71 268 74 290 C77 296 83 296 85 290 C88 266 88 242 86 220 C83 216 80 215 77 218 Z' },
  { key: 'adductors', zone: 'lower', d: 'M86 220 C92 226 96 236 97 250 C97 262 94 270 90 274 C89 256 89 238 86 220 Z' },
  { key: 'vastus_medialis', zone: 'lower', d: 'M90.7 259.2 C97.9 273.6 97.9 293.4 89.8 306 C82.6 308.7 76.3 303.3 77.2 292.5 C79 281.7 85.3 270 90.7 259.2 Z' },
  { key: 'gastrocnemius', zone: 'lower', d: 'M68 326 C61 338 61 352 66 366 C69 368 72 367 74 364 C72 352 72 340 75 326 Z' },
  { key: 'gastrocnemius', zone: 'lower', d: 'M82 326 C89 336 92 350 89 364 C87 368 83 368 81 364 C83 352 83 340 82 326 Z' },
];

export const BACK = [
  { key: 'traps_upper', zone: 'upper', d: 'M100 58 C94 66 82 74 64 80 C74 86 88 86 100 86 Z' },
  { key: 'traps_mid', zone: 'upper', d: 'M100 86 C88 86 76 86 68 89 C76 96 88 103 100 108 Z' },
  { key: 'rhomboids', zone: 'upper', d: 'M100 108 C92 104 86 100 80 97 C82 110 90 122 100 128 Z' },
  { key: 'delts_side', zone: 'upper', d: 'M57 82 C49 85 43 93 41 103 C40 111 41 117 43 122 C46 122 49 121 51 120 C50 109 52 96 57 82 Z' },
  { key: 'delts_rear', zone: 'upper', d: 'M57 82 C52 96 50 109 51 120 C55 120 59 118 62 115 C63 106 66 96 72 88 C67 85 62 83 57 82 Z' },
  { key: 'lats', zone: 'upper', d: 'M80 98 C72 100 64 106 62 116 C64 140 72 162 86 182 C90 180 94 176 96 172 C93 158 92 142 94 128 C89 120 84 110 80 98 Z' },
  { key: 'lower_back', zone: 'upper', d: 'M99 132 C97 150 96 164 96 175 C92 179 89 182 87 186 C90 196 95 202 99 204 Z' },
  { key: 'triceps_lateral', zone: 'upper', part: 'arm', d: 'M44 123 C47 121.5 50 122.5 51 125.5 C51 129 51 131.5 50.5 134 C46.5 137 44.5 150 45 163 C43.5 163 42.5 162 41.8 160 C39 149 39.5 134 44 123 Z' },
  { key: 'triceps_long', zone: 'upper', part: 'arm', d: 'M51 125.5 C53 121.5 57 121 59.5 122 C62.5 132 63 148 59.8 160 C59 162 57.5 163.5 56 163 C56.5 150 54.5 137 50.5 134 C51 131.5 51 129 51 125.5 Z' },
  { key: 'triceps_medial', zone: 'upper', part: 'arm', d: 'M45 163 C48 165 53 165 56 163 C57.5 163.5 59 162 59.8 160 C60 163 59 166 57 167.5 C52 169.5 47 169.5 43.5 167.5 C42.5 166 42 163.5 41.8 160 C42.5 162 43.5 163 45 163 Z' },
  { key: 'forearm_extensors', zone: 'upper', part: 'arm', d: 'M44 170 C38 184 38 200 42 212 L56 212 C58 200 59 184 57 170 C53 168 48 168 44 170 Z' },
  { key: 'glute_med', zone: 'lower', d: 'M74 188 C68 196 66 206 67 214 C74 210 80 204 86 197 C82 192 78 189 74 188 Z' },
  { key: 'glute_max', zone: 'lower', d: 'M86 197 C76 204 67 212 66 222 C66 240 75 250 87 251 C96 251 100 244 100 234 L100 201 C96 199 91 197 86 197 Z' },
  { key: 'biceps_femoris', zone: 'lower', d: 'M68 252 C62 266 60 288 64 302 C66 308 74 309 77 304 C75 288 76 270 79 256 C76 251 71 250 68 252 Z' },
  { key: 'semitendinosus', zone: 'lower', d: 'M80 256 C77 272 77 290 79 304 C82 309 88 309 90 303 C91 290 90 276 89 264 C87 255 83 252 80 256 Z' },
  { key: 'adductors', zone: 'lower', d: 'M89.5 253.3 C92.7 252.7 95.4 255.9 95.7 261.1 C96 268.9 94.7 275.4 92.1 279.4 C90.2 278.1 89.5 272.9 89.5 266.4 C88.9 261.1 88.9 256.6 89.5 253.3 Z' },
  { key: 'gastrocnemius', zone: 'lower', d: 'M68 322 C61 336 61 354 68 368 C73 370 78 366 79 360 C80 346 79 334 78 322 Z' },
  { key: 'gastrocnemius', zone: 'lower', d: 'M79 322 C79 336 80 348 80 360 C82 367 88 370 91 366 C95 352 94 336 88 322 Z' },
  { key: 'soleus', zone: 'lower', d: 'M70 370 C73 382 75 392 77 398 L86 398 C88 390 90 380 91 370 C86 374 81 374 79 366 C77 372 73 373 70 370 Z' },
];

export const HAIR_FRONT = 'M100 8 C84 8 74 20 75 38 C76 46 78 52 80 56 C80 44 82 32 88 26 C94 22 106 22 112 26 C118 32 120 44 120 56 C122 52 124 46 125 38 C126 20 116 8 100 8 Z';
export const HAIR_BACK = 'M100 8 C84 8 75 20 76 38 C77 50 86 60 100 62 C114 60 123 50 124 38 C125 20 116 8 100 8 Z M95 60 C93 70 94 80 100 86 C106 80 107 70 105 60 Z';

export const SEX_SHAPE = {
  male: { upper: 1, lower: 1, hair: false },
  female: { upper: 0.9, lower: 1.06, hair: true },
};
