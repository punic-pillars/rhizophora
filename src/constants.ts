// ============================================================
// constants.ts — Shared constants for Component Vision
// ============================================================

/**
 * Known leaf primitives — components with intrinsic/fixed dimensions
 * that do NOT need onLayout handlers to report their size to parents.
 *
 * These are filtered out of boundary gap detection to reduce noise.
 */
export const KNOWN_LEAF_PRIMITIVES = new Set<string>([
  // ── React Native Core ──────────────────────────────────────
  'View',
  'Text',
  'Image',
  'ScrollView',
  'TextInput',
  'Switch',
  'Slider',
  'Modal',
  'RefreshControl',
  'ActivityIndicator',
  'KeyboardAvoidingView',
  'StatusBar',
  'SafeAreaView',

  // ── React Native Animated wrappers ─────────────────────────
  'Animated.View',
  'Animated.Text',
  'Animated.Image',
  'Animated.ScrollView',

  // ── Expo / Community primitives ────────────────────────────
  'ExpoStatusBar',
  'LinearGradient',
  'BlurView',
  'Svg',
  'SvgXml',
  'Circle',
  'Rect',
  'Path',
  'G',
  'Defs',
  'Line',
  'Polygon',
  'Polyline',
  'Ellipse',
  'Stop',
  'ClipPath',
  'Mask',
  'Use',
  'Symbol',
  'LinearGradient',
  'RadialGradient',
  'FeTurbulence',
  'FeColorMatrix',
  'FeBlend',
  'FeGaussianBlur',
  'FeOffset',
  'FeMerge',
  'FeMergeNode',
  'FeComposite',
  'FeFlood',
  'FeDisplacementMap',
  'FeDropShadow',

  // ── Reanimated ─────────────────────────────────────────────
  'Reanimated',

  // ── Icon Libraries ─────────────────────────────────────────
  'Ionicons',
  'MaterialIcons',
  'FontAwesome',
  'Feather',
  'MaterialCommunityIcons',
  'Octicons',
  'AntDesign',
  'Entypo',
  'EvilIcons',
  'FontAwesome5',
  'Fontisto',
  'Foundation',
  'SimpleLineIcons',
  'Zocial',
  'FontAwesome6',
  'FontAwesome6Brand',
  'FontAwesome6Regular',
  'FontAwesome6Solid',
]);

/**
 * React Native Animated primitives — components that are animated
 * wrappers of core primitives. These are treated as primitives by
 * the Vein Propagation Engine (not walked into for child resolution).
 */
export const RN_ANIMATED_PRIMITIVES = new Set<string>([
  'Animated.View',
  'Animated.Text',
  'Animated.Image',
  'Animated.ScrollView',
  'Animated.FlatList',
  'Animated.SectionList',
]);

/**
 * Check if a component name matches a known leaf primitive.
 * Handles both exact matches and icon-suffixed names (e.g., *Icon, *IconComponent).
 */
export function isKnownLeafPrimitive(name: string): boolean {
  if (KNOWN_LEAF_PRIMITIVES.has(name)) return true;
  // Catch icon-suffixed names like SearchIcon, CloseIcon, etc.
  if (/Icon$/i.test(name) || /IconComponent$/i.test(name)) return true;
  return false;
}

/**
 * Default tolerance for contract validation (in pixels).
 * Δ ≤ STRICT: PASS (noise threshold for float rounding)
 * Δ ≤ WARN:  WARN (visible but small)
 * Δ > WARN:  FAIL (definitely broken)
 */
export const CONTRACT_TOLERANCE = {
  STRICT: 2,
  WARN: 10,
} as const;

/**
 * Standard iOS status bar height.
 */
export const STATUS_BAR_HEIGHT = 44;

/**
 * Default buffer for header↔scrollview padding equation.
 */
export const CONTRACT_BUFFER = 20;
