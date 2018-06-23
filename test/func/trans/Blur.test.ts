import { mainTest } from "../funcTestUtils";

describe("Blur", function() {
    function makePreset(opts: any) {
        const blurOpts = Object.assign({
            "type": "Blur",
            "group": "Trans",
        }, opts);
        return {
            "components": [
                {
                    "type": "EffectList",
                    "enabled": true,
                    "clearFrame": true,
                    "input": "IGNORE",
                    "output": "EVERY_OTHER_PIXEL",
                    "components": [
                        {
                            "type": "ClearScreen",
                            "group": "Render",
                            "enabled": true,
                            "color": "#64f0b8",
                            "blendMode": "REPLACE",
                            "onlyFirst": false
                        }
                    ]
                },
                {
                    "type": "SuperScope",
                    "group": "Render",
                    "code": {
                        "init": "n = 4;",
                        "perFrame": "",
                        "onBeat": "",
                        "perPoint": "ii = i * (n -1);\r\nx = above(ii, 1) * ((ii - 2) - 0.5);\r\ny = below(ii, 2) * (ii - 0.5) ;\r\ndrawmode = ii % 2;\r\nlinesize = 1;"
                    },
                    "audioChannel": "CENTER",
                    "audioSource": "WAVEFORM",
                    "colors": [
                        "#ffffff"
                    ],
                    "drawMode": "DOTS"
                },
                blurOpts,
            ],
        };
    }

    it("should run for light, round-down", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "LIGHT", round: "DOWN"}),
        });
    });

    it("should run for light, round-up", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "LIGHT", round: "UP"}),
        });
    });

    it("should run for medium, round-down", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "MEDIUM", round: "DOWN"}),
        });
    });

    it("should run for medium, round-up", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "MEDIUM", round: "UP"}),
        });
    });

    it("should run for heavy, round-down", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "HEAVY", round: "DOWN"}),
        });
    });

    it("should run for heavy, round-up", () => {
        return mainTest({
            expectImageSrc: "Blur_Light_RoundDown.png",
            preset: makePreset({blur: "HEAVY", round: "UP"}),
        });
    });

});
