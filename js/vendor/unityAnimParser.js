/**
 * Unity .anim YAML Parser
 * Parses Unity AnimationClip files (.anim) in YAML format
 */

class UnityAnimParser {
  constructor() {
    this.data = null;
  }

  /**
   * Parse a Unity .anim file content
   * @param {string} content - The file content as a string
   * @returns {object} Parsed animation data
   */
  parse(content) {
    const lines = content.split('\n');
    this.data = {
      header: {},
      animationClip: null
    };

    // Parse header
    if (lines[0].startsWith('%YAML')) {
      this.data.header.yaml = lines[0].trim();
    }
    if (lines[1].startsWith('%TAG')) {
      this.data.header.tag = lines[1].trim();
    }

    // Find AnimationClip section
    let currentLine = 2;
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      if (line.includes('!u!74')) {
        // Found AnimationClip header
        const match = line.match(/--- !u!74 &(\d+)/);
        if (match) {
          this.data.header.fileID = match[1];
        }
        currentLine++;
        break;
      }
      currentLine++;
    }

    // Parse AnimationClip
    this.data.animationClip = this._parseAnimationClip(lines, currentLine);

    return this.data;
  }

  /**
   * Parse the AnimationClip section
   * @private
   */
  _parseAnimationClip(lines, startLine) {
    const clip = {
      m_ObjectHideFlags: 0,
      m_CorrespondingSourceObject: {},
      m_PrefabInstance: {},
      m_PrefabAsset: {},
      m_Name: '',
      serializedVersion: 0,
      m_Legacy: 0,
      m_Compressed: 0,
      m_UseHighQualityCurve: 0,
      m_RotationCurves: [],
      m_CompressedRotationCurves: [],
      m_EulerCurves: [],
      m_PositionCurves: [],
      m_ScaleCurves: [],
      m_FloatCurves: [],
      m_EulerEditorCurves: [],
      m_HasGenericRootTransform: 0,
      m_HasMotionFloatCurves: 0,
      m_Events: []
    };

    let i = startLine;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('m_ObjectHideFlags:')) {
        clip.m_ObjectHideFlags = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_Name:')) {
        clip.m_Name = this._extractValue(trimmed);
      } else if (trimmed.startsWith('serializedVersion:')) {
        clip.serializedVersion = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_Legacy:')) {
        clip.m_Legacy = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_Compressed:')) {
        clip.m_Compressed = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_UseHighQualityCurve:')) {
        clip.m_UseHighQualityCurve = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_FloatCurves:')) {
        const result = this._parseFloatCurves(lines, i + 1);
        clip.m_FloatCurves = result.curves;
        i = result.nextLine - 1;
      } else if (trimmed.startsWith('m_HasGenericRootTransform:')) {
        clip.m_HasGenericRootTransform = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_HasMotionFloatCurves:')) {
        clip.m_HasMotionFloatCurves = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('m_Events:')) {
        clip.m_Events = this._parseArray(lines, i + 1).array;
      }

      i++;
    }

    return clip;
  }

  /**
   * Parse float curves (the main animation data)
   * @private
   */
  _parseFloatCurves(lines, startLine) {
    const curves = [];
    let i = startLine;
    let curveCount = 0;

    console.log(`Starting _parseFloatCurves at line ${startLine}`);

    while (i < lines.length) {
      const line = lines[i];
      const indent = this._getIndent(line);

      // Check if we've moved past the float curves section
      // m_FloatCurves starts at indent 2, so curves inside are at indent 2+
      if (indent === 2 && line.trim().startsWith('m_') && !line.trim().startsWith('m_FloatCurves')) {
        console.log(`Exiting float curves at line ${i}: ${line.trim()}`);
        break;
      }

      // Check for new curve entry (at indent 2)
      if (indent === 2 && line.trim().startsWith('- serializedVersion:')) {
        curveCount++;
        if (curveCount <= 2) {
          console.log(`Parsing curve ${curveCount} at line ${i}`);
        }
        const result = this._parseFloatCurve(lines, i);
        curves.push(result.curve);
        if (curveCount <= 2) {
          console.log(`Curve ${curveCount} has ${result.curve.curve.m_Curve.length} keyframes`);
        }
        i = result.nextLine - 1;
      }

      i++;
    }

    console.log(`Parsed ${curves.length} float curves`);
    return { curves, nextLine: i };
  }

  /**
   * Parse a single float curve
   * @private
   */
  _parseFloatCurve(lines, startLine) {
    const curve = {
      serializedVersion: 0,
      curve: {
        serializedVersion: 0,
        m_Curve: [],
        m_PreInfinity: 2,
        m_PostInfinity: 2,
        m_RotationOrder: 4
      },
      attribute: '',
      path: '',
      classID: 0,
      script: {},
      flags: 0
    };

    let i = startLine;
    let inCurveData = false;
    let inKeyframes = false;
    const isFirstCurve = startLine < 25; // Debug first curve only

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this._getIndent(line);

      if (isFirstCurve && i < startLine + 50) {
        // Debug first 50 lines of first curve
        if (trimmed === 'curve:' || trimmed === 'm_Curve:' || trimmed.startsWith('- serializedVersion:')) {
          console.log(`Line ${i} (indent ${indent}): ${trimmed.substring(0, 30)}`);
        }
      }

      // Detect when we've finished this curve (next curve starts)
      // Don't break on the first line (startLine)
      if (i !== startLine && indent === 2 && trimmed.startsWith('- serializedVersion:')) {
        break;
      }
      if (i !== startLine && indent === 2 && trimmed.startsWith('m_')) {
        break;
      }

      if (trimmed.startsWith('serializedVersion:') && !inCurveData) {
        curve.serializedVersion = parseInt(this._extractValue(trimmed));
      } else if (trimmed === 'curve:') {
        inCurveData = true;
      } else if (inCurveData) {
        if (trimmed.startsWith('serializedVersion:')) {
          curve.curve.serializedVersion = parseInt(this._extractValue(trimmed));
        } else if (trimmed === 'm_Curve:') {
          inKeyframes = true;
          if (curve.curve.m_Curve.length === 0) {
            console.log('Starting keyframe parsing for curve');
          }
        } else if (inKeyframes && trimmed.startsWith('- serializedVersion:')) {
          const result = this._parseKeyframe(lines, i);
          curve.curve.m_Curve.push(result.keyframe);
          i = result.nextLine - 1;
          if (curve.curve.m_Curve.length === 1) {
            console.log('First keyframe parsed:', result.keyframe);
          }
        } else if (trimmed.startsWith('m_PreInfinity:')) {
          curve.curve.m_PreInfinity = parseInt(this._extractValue(trimmed));
          inKeyframes = false;
        } else if (trimmed.startsWith('m_PostInfinity:')) {
          curve.curve.m_PostInfinity = parseInt(this._extractValue(trimmed));
        } else if (trimmed.startsWith('m_RotationOrder:')) {
          curve.curve.m_RotationOrder = parseInt(this._extractValue(trimmed));
          inCurveData = false;
        }
      } else if (trimmed.startsWith('attribute:')) {
        curve.attribute = this._extractValue(trimmed);
      } else if (trimmed.startsWith('path:')) {
        curve.path = this._extractValue(trimmed);
      } else if (trimmed.startsWith('classID:')) {
        curve.classID = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('flags:')) {
        curve.flags = parseInt(this._extractValue(trimmed));
        break; // This is the last field in a curve
      }

      i++;
    }

    return { curve, nextLine: i + 1 };
  }

  /**
   * Parse a single keyframe
   * @private
   */
  _parseKeyframe(lines, startLine) {
    const keyframe = {
      serializedVersion: 0,
      time: 0,
      value: 0,
      inSlope: 0,
      outSlope: 0,
      tangentMode: 0,
      weightedMode: 0,
      inWeight: 0,
      outWeight: 0
    };

    let i = startLine;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this._getIndent(line);

      // Check if we've moved to the next keyframe or out of keyframes
      // Keyframes start at indent 6
      if (indent === 6 && trimmed.startsWith('- serializedVersion:') && i !== startLine) {
        break;
      }
      if (indent <= 6 && trimmed.startsWith('m_')) {
        break;
      }

      if (trimmed.startsWith('serializedVersion:')) {
        keyframe.serializedVersion = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('time:')) {
        keyframe.time = parseFloat(this._extractValue(trimmed));
      } else if (trimmed.startsWith('value:')) {
        keyframe.value = parseFloat(this._extractValue(trimmed));
      } else if (trimmed.startsWith('inSlope:')) {
        keyframe.inSlope = parseFloat(this._extractValue(trimmed));
      } else if (trimmed.startsWith('outSlope:')) {
        keyframe.outSlope = parseFloat(this._extractValue(trimmed));
      } else if (trimmed.startsWith('tangentMode:')) {
        keyframe.tangentMode = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('weightedMode:')) {
        keyframe.weightedMode = parseInt(this._extractValue(trimmed));
      } else if (trimmed.startsWith('inWeight:')) {
        keyframe.inWeight = parseFloat(this._extractValue(trimmed));
      } else if (trimmed.startsWith('outWeight:')) {
        keyframe.outWeight = parseFloat(this._extractValue(trimmed));
        break; // This is the last field in a keyframe
      }

      i++;
    }

    return { keyframe, nextLine: i + 1 };
  }

  /**
   * Parse empty arrays
   * @private
   */
  _parseArray(lines, startLine) {
    const array = [];
    // For now, just handle empty arrays marked with []
    return { array, nextLine: startLine };
  }

  /**
   * Extract value from a YAML line
   * @private
   */
  _extractValue(line) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return '';
    return line.substring(colonIndex + 1).trim();
  }

  /**
   * Get indentation level of a line
   * @private
   */
  _getIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Get animation duration
   * @returns {number} Duration in seconds
   */
  getDuration() {
    if (!this.data || !this.data.animationClip) return 0;

    let maxTime = 0;
    for (const floatCurve of this.data.animationClip.m_FloatCurves) {
      if (floatCurve.curve && floatCurve.curve.m_Curve.length > 0) {
        const lastKeyframe = floatCurve.curve.m_Curve[floatCurve.curve.m_Curve.length - 1];
        maxTime = Math.max(maxTime, lastKeyframe.time);
      }
    }

    return maxTime;
  }

  /**
   * Get all animated properties
   * @returns {Array} List of animated properties with their paths
   */
  getAnimatedProperties() {
    if (!this.data || !this.data.animationClip) return [];

    return this.data.animationClip.m_FloatCurves.map(curve => ({
      attribute: curve.attribute,
      path: curve.path,
      keyframeCount: curve.curve.m_Curve.length
    }));
  }

  /**
   * Get value at specific time for a given attribute
   * @param {string} attribute - The attribute name
   * @param {number} time - Time in seconds
   * @returns {number|null} Interpolated value or null if not found
   */
  getValueAtTime(attribute, time) {
    if (!this.data || !this.data.animationClip) return null;

    const curve = this.data.animationClip.m_FloatCurves.find(c => c.attribute === attribute);
    if (!curve || !curve.curve.m_Curve.length) return null;

    const keyframes = curve.curve.m_Curve;

    // Handle out of bounds
    if (time <= keyframes[0].time) return keyframes[0].value;
    if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

    // Find surrounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];

      if (time >= k1.time && time <= k2.time) {
        // Linear interpolation (could be enhanced with slope consideration)
        const t = (time - k1.time) / (k2.time - k1.time);
        return k1.value + (k2.value - k1.value) * t;
      }
    }

    return null;
  }
}

// Export for ES6 modules
export { UnityAnimParser };

// Export for Node.js (CommonJS)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnityAnimParser;
}

// Example usage (Node.js only):
if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');

  // Read the .anim file
  const content = fs.readFileSync('PackObjects.anim', 'utf-8');

  // Parse it
  const parser = new UnityAnimParser();
  const animData = parser.parse(content);

  // Display information
  console.log('Animation Name:', animData.animationClip.m_Name);
  console.log('Duration:', parser.getDuration(), 'seconds');
  console.log('Number of animated properties:', animData.animationClip.m_FloatCurves.length);
  console.log('\nAnimated Properties:');
  parser.getAnimatedProperties().slice(0, 10).forEach(prop => {
    console.log(`  - ${prop.attribute} (${prop.keyframeCount} keyframes)`);
  });
}
