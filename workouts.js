// ユーザー定義ワークアウトリスト
// ここに自分のワークアウトを追加してください
const STATIC_WORKOUTS = [

    {
        id: "mywhoosh_45min",
        name: "45minL3-5build-up",
        description: "mywhoosh - 45minL3-5build-up",
        segments: [
            { type: "Warmup", duration: 600, power_low: 0.5, power_high: 0.7 },
            { type: "SteadyState", duration: 300, power: 0.8 },
            { type: "SteadyState", duration: 180, power: 0.9 },
            { type: "SteadyState", duration: 60, power: 1.0 },
            { type: "SteadyState", duration: 300, power: 0.86 },
            { type: "SteadyState", duration: 180, power: 0.9 },
            { type: "SteadyState", duration: 60, power: 1.05 },
            { type: "SteadyState", duration: 300, power: 0.86 },
            { type: "SteadyState", duration: 180, power: 0.95 },
            { type: "SteadyState", duration: 60, power: 1.1 },
            { type: "SteadyState", duration: 300, power: 0.86 },
            { type: "SteadyState", duration: 180, power: 0.95 },
            { type: "SteadyState", duration: 60, power: 1.15 },
            { type: "SteadyState", duration: 300, power: 0.86 },
            { type: "SteadyState", duration: 180, power: 0.95 },
            { type: "SteadyState", duration: 60, power: 1.21 },
            { type: "CoolDown", duration: 300, power_low: 0.5, power_high: 0.3 }
        ]
    },
    {
        id: "mywhoosh_hidit",
        name: "HIDIT",
        description: "mywhoosh - hidit",
        segments: [
            { type: "Warmup", duration: 120, power_low: 0.5, power_high: 0.6 },
            { type: "SteadyState", duration: 360, power: 0.6 },
            { type: "Warmup", duration: 120, power_low: 0.65, power_high: 1.4 },
            { type: "SteadyState", duration: 60, power: 0.55 },
            { type: "SteadyState", duration: 60, power: 1.35 },
            { type: "SteadyState", duration: 170, power: 0.55 },
            { type: "SteadyState", duration: 180, power: 1.3 },
            { type: "SteadyState", duration: 120, power: 0.55 },
            { type: "SteadyState", duration: 120, power: 1.3 },
            { type: "SteadyState", duration: 90, power: 0.55 },
            { type: "SteadyState", duration: 90, power: 1.3 },
            { type: "SteadyState", duration: 60, power: 0.55 },
            { type: "SteadyState", duration: 60, power: 1.3 },
            { type: "SteadyState", duration: 40, power: 0.55 },
            { type: "SteadyState", duration: 40, power: 1.3 },
            { type: "SteadyState", duration: 30, power: 0.5 },
            { type: "SteadyState", duration: 30, power: 1.3 },
            { type: "SteadyState", duration: 20, power: 0.5 },
            { type: "SteadyState", duration: 30, power: 1.3 },
            { type: "SteadyState", duration: 20, power: 0.5 },
            { type: "SteadyState", duration: 30, power: 1.3 },
            { type: "SteadyState", duration: 20, power: 0.4 },
            { type: "SteadyState", duration: 30, power: 1.3 },
            { type: "SteadyState", duration: 20, power: 0.4 },
            { type: "CoolDown", duration: 300, power_low: 0.55, power_high: 0.4 }
        ]
    }
];
