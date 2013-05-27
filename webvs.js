window.Webvs = (function() {

    /*** Constants ***/

    var typesSuffixMap = {
        "bool": "1i",
        "int": "1i",
        "float": "1f",
        "vec2": "2f",
        "ivec2": "2i",
        "bvec2": "2b",
        "vec3": "3f",
        "ivec3": "3i",
        "bvec3": "3b",
        "vec4": "4f",
        "ivec4": "4i",
        "bvec4": "4b",
        "mat2": "Matrix2fv",
        "mat3": "Matrix3fv",
        "mat4": "Matrix4fv"
    };

    var rUniform = /uniform\s+([a-z]+\s+)?([A-Za-z0-9]+)\s+([a-zA-Z_0-9]+)\s*(\[\s*(.+)\s*\])?/;
    var rStruct = /struct\s+\w+\s*{[^}]+}\s*;/g;
    var rStructExtract = /struct\s+(\w+)\s*{([^}]+)}\s*;/;
    var rStructFields = /[^;]+;/g;
    var rStructField = /\s*([a-z]+\s+)?([A-Za-z0-9]+)\s+([a-zA-Z_0-9]+)\s*(\[\s*(.+)\s*\])?\s*;/;
    var rDefine = /#define\s+([a-zA-Z_0-9]+)\s+(.*)/;

    var Lprefix = "Webvs: ";


    /*** Utility functions ***/

    function log (msg) {
        console.log && console.log(Lprefix+msg);
    }
    function warn (msg) {
        if (console.warn) console.warn(Lprefix+msg);
        else log("WARN "+msg);
    }
    function error (msg) {
        if (console.error) console.error(Lprefix+msg);
        else log("ERR "+msg);
    }

    var genid = (function (i) { return function () { return ++i; } })(0);

    function isArray (a) {
        return 'length' in a; // duck typing
    }

    /**
     * Main object
     */
    var Webvs = function(effectOptList) {
        this.effects = [];
        for(var i = 0;i < effects.length;i++) {
            this.effects.push(new Webvs.Effect(effectOptList));
        }
    }

    /**
     * An effect
     */
    Webvs.Effect = function(options) {
        var requiredOptions = ["variables", "fragment"];
        for(var i = 0;i < requiredOptions.length;i++) {
            if(!(requiredOptions[i] in options)) {
                throw new Error("Webvs: option '"+requiredOptions[i]+"' required in Effect options");
            }
        }
        this.variables = options.variables;
        this.init = options.init || function(t){};
        this.update = options.update || function(t){};

        this.prog = new Webvs.Program ('attribute vec2 position; void main() { gl_Position = vec4(2.0*position-1.0, 0.0, 1.0);}', options.fragment);

        for (var key in this.prog.uniformTypes) {
          if (!(key in this.variables) && key!="resolution") {
            warn("variable '"+key+"' not initialized");
          }
        }

        this.init(options);
    };

    /**
     * A WebGL program with shaders and variables.
     * @param {String} vertex The vertex shader source code.
     * @param {String} fragment The fragment shader source code.
     * @public
     */
    Webvs.Program = function (vertex, fragment) {
        this.gl = null;
        this.vertex = vertex;
        this.fragment = fragment;

        var src = vertex + '\n' + fragment;
        this.parseDefines(src);
        this.parseStructs(src);
        this.parseUniforms(src);
    };

    Webvs.Program.prototype = {

        /**
         * A map containing all the #define declarations of the GLSL.
         *
         * You can use it to synchronize some constants between GLSL and Javascript (like an array capacity).
         * @public
         */
        defines: null,

        /** 
         * Synchronize a variable from the Javascript into the GLSL.
         * @param {String} name variable name to synchronize.
         * @param {String} value variable value.
         * @public
         */
        syncVariable: function (name, value) {
            this.recSyncVariable(name, value, this.uniformTypes[name],  name);
        },

        // ~~~ Going Private Now

        parseDefines: function (src) {
            this.defines = {};
            var lines = src.split("\n");
            for (var l=0; l<lines.length; ++l) {
                var matches = lines[l].match(rDefine);
                if (matches && matches.length==3) {
                    var dname = matches[1],
                        dvalue = matches[2];
                    this.defines[dname] = dvalue;
                }
            }
        },

        parseStructs: function (src) {
            this.structTypes = {};
            var structs = src.match(rStruct);
            if (!structs) return;
            for (var s=0; s<structs.length; ++s) {
                var struct = structs[s];
                var structExtract = struct.match(rStructExtract);
                var structName = structExtract[1];
                var structBody = structExtract[2];
                var fields = structBody.match(rStructFields);
                var structType = {};
                for (var f=0; f<fields.length; ++f) {
                    var field = fields[f];
                    var matches = field.match(rStructField);
                    var nativeType = matches[2],
                        vname = matches[3],
                        arrayLength = matches[4];
                    var type = typesSuffixMap[nativeType] || nativeType;
                    if (arrayLength) {
                        if (arrayLength in this.defines) arrayLength = this.defines[arrayLength];
                        type = [type, parseInt(arrayLength, 10)];
                    }
                    structType[vname] = type;
                }
                this.structTypes[structName] = structType;
            }
        },

        parseUniforms: function (src) {
            this.uniformTypes = {};
            var lines = src.split("\n");
            for (var l=0; l<lines.length; ++l) {
                var line = lines[l];
                var matches = line.match(rUniform);
                if (matches) {
                    var nativeType = matches[2],
                        vname = matches[3],
                              arrayLength = matches[5];
                    var type = typesSuffixMap[nativeType] || nativeType;
                    if (arrayLength) {
                        if (arrayLength in this.defines) arrayLength = this.defines[arrayLength];
                        type = [type, parseInt(arrayLength, 10)];
                    }
                    this.uniformTypes[vname] = type;
                }
            }
        },

        recSyncVariable: function (name, value, type, varpath) {
            var gl = this.gl;
            if (!type) {
                warn("variable '"+name+"' not found in your GLSL.");
                return;
            }
            var arrayType = type instanceof Array;
            var arrayLength;
            if (arrayType) {
                arrayLength = type[1];
                type = type[0];
            }
            var loc = this.locations[varpath];
            if (type in this.structTypes) {
                var structType = this.structTypes[type];
                if (arrayType) {
                    for (var i=0; i<arrayLength && i<value.length; ++i) {
                        var pref = varpath+"["+i+"].";
                        var v = value[i];
                        for (var field in structType) {
                            if (!(field in v)) {
                                warn("variable '"+varpath+"["+i+"]' ("+type+") has no field '"+field+"'");
                                break;
                            }
                            var fieldType = structType[field];
                            this.recSyncVariable(field, v[field], fieldType, pref+field);
                        }
                    }
                }
                else {
                    var pref = varpath+".";
                    for (var field in structType) {
                        if (!(field in value)) {
                            warn("variable '"+varpath+"' ("+type+") has no field '"+field+"'");
                            break;
                        }
                        var fieldType = structType[field];
                        this.recSyncVariable(field, value[field], fieldType, pref+field);
                    }
                }
            }
            else {
                var t = type;
                if (arrayType) t += "v";
                var fn = "uniform"+t;
                switch (t) {
                    case "2f":
                    case "2i":
                        if (isArray(value))
                            gl[fn].call(gl, loc, value[0], value[1]);
                        else if ('x' in value && 'y' in value)
                            gl[fn].call(gl, loc, value.x, value.y);
                        else if ('s' in value && 't' in value)
                            gl[fn].call(gl, loc, value.s, value.t);
                        else
                            error("variable '"+varpath+"' is not valid for binding to vec2(). Use an Array, a {x,y} or a {s,t}.");
                        break;

                    case "3f":
                    case "3i":
                        if (isArray(value))
                            gl[fn].call(gl, loc, value[0], value[1], value[2]);
                        else if ('x' in value && 'y' in value && 'z' in value)
                            gl[fn].call(gl, loc, value.x, value.y, value.z);
                        else if ('s' in value && 't' in value && 'p' in value)
                            gl[fn].call(gl, loc, value.s, value.t, value.p);
                        else if ('r' in value && 'g' in value && 'b' in value)
                            gl[fn].call(gl, loc, value.r, value.g, value.b);
                        else
                            error("variable '"+varpath+"' is not valid for binding to vec3(). Use an Array, a {x,y,z}, a {r,g,b} or a {s,t,p}.");
                        break;

                    case "4f":
                    case "4i":
                        if (isArray(value))
                            gl[fn].call(gl, loc, value[0], value[1], value[2], value[3]);
                        else if ('x' in value && 'y' in value && 'z' in value && 'w' in value)
                            gl[fn].call(gl, loc, value.x, value.y, value.z, value.w);
                        else if ('s' in value && 't' in value && 'p' in value && 'q' in value)
                            gl[fn].call(gl, loc, value.s, value.t, value.p, value.q);
                        else if ('r' in value && 'g' in value && 'b' in value && 'a' in value)
                            gl[fn].call(gl, loc, value.r, value.g, value.b, value.a);
                        else
                            error("variable '"+varpath+"' is not valid for binding to vec4(). Use an Array, a {x,y,z,w}, a {r,g,b,a} or a {s,t,p,q}.");
                        break;

                    case "sampler2D": 
                        this.syncTexture(gl, loc, value, varpath); 
                        break;

                    default:
                        if (fn in gl)
                            gl[fn].call(gl, loc, value); // works for simple types and arrays
                        else
                            error("type '"+type+"' not found.");
                        break;
                }
            }
        },

        syncTexture: function (gl, loc, value, id) {
            var textureUnit = this.textureUnitForNames[id];
            if (!textureUnit) {
                textureUnit = this.allocTexture(id);
            }

            gl.activeTexture(gl.TEXTURE0 + textureUnit);

            var texture = this.textureForTextureUnit[textureUnit];
            if (texture) {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, value);
            }
            else {
                texture = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, value);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.uniform1i(loc, textureUnit);
                this.textureForTextureUnit[textureUnit] = texture;
            }
        },

        allocTexture: function (id) {
            var textureUnit = this.textureUnitCounter;
            this.textureUnitForNames[id] = textureUnit;
            this.textureUnitCounter ++;
            return textureUnit;
        },

        initUniformLocations: function () {
            this.locations = {}; // uniforms locations
            for (var v in this.uniformTypes)
                this.recBindLocations(v, this.uniformTypes[v], v);
        },

        recBindLocations: function (name, type, varpath) {
            var arrayType = type instanceof Array;
            var arrayLength;
            if (arrayType) {
                arrayLength = type[1];
                type = type[0];
            }
            if (type in this.structTypes) {
                var structType = this.structTypes[type];
                if (arrayType) {
                    for (var i=0; i<arrayLength; ++i) {
                        var pref = varpath+"["+i+"].";
                        for (var field in structType) {
                            this.recBindLocations(field, structType[field], pref+field);
                        }
                    }
                }
                else {
                    var pref = varpath+".";
                    for (var field in structType) {
                        this.recBindLocations(field, structType[field], pref+field);
                    }
                }
            }
            else {
                this.locations[varpath] = this.gl.getUniformLocation(this.program, varpath);
            }
        },

        load: function () {
            var gl = this.gl;

            // Clean old program
            if (this.program) {
                gl.deleteProgram(this.program);
                this.program = null;
            }

            // Create new program
            this.program = this.loadProgram([
                    this.loadShader(this.vertex, gl.VERTEX_SHADER), 
                    this.loadShader(this.fragment, gl.FRAGMENT_SHADER)
                    ]);
            gl.useProgram(this.program);

            /*
               var nbUniforms = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
               for (var i=0; i<nbUniforms; ++i) {
               console.log(this.gl.getActiveUniform(this.program, i));
               }
             */

            // Bind custom variables
            this.initUniformLocations();

            // Init textures
            this.textureUnitForNames = {};
            this.textureForTextureUnit = {};
            this.textureUnitCounter = 0;
        },

        loadProgram: function (shaders) {
            var gl = this.gl;
            var program = gl.createProgram();
            shaders.forEach(function (shader) {
                gl.attachShader(program, shader);
            });
            gl.linkProgram(program);

            var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
            if (!linked) {
                gl.deleteProgram(program);
                throw new Error(program+" "+gl.getProgramInfoLog(program));
            }
            return program;
        },

        loadShader: function (shaderSource, shaderType) {
            var gl = this.gl;
            var shader = gl.createShader(shaderType);
            gl.shaderSource(shader, shaderSource);
            gl.compileShader(shader);
            var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
            if (!compiled) {
                var lastError = gl.getShaderInfoLog(shader);
                var split = lastError.split(":");
                var col = parseInt(split[1], 10);
                var line = parseInt(split[2], 10);
                var s = "";
                if (!isNaN(col)) {
                    var spaces = ""; for (var i=0; i<col; ++i) spaces+=" ";
                    s = "\n"+spaces+"^";
                }
                error(lastError+"\n"+shaderSource.split("\n")[line-1]+s);
                gl.deleteShader(shader);
                throw new Error(shader+" "+lastError);
            }
            return shader;
        }
    };

    return Webvs;
})()
