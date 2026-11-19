import { defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.deploy = { limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } } };
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const backendApi = service("backend-api", {
    source: github("Kalilnobrega/Goals", { checkSuites: false, rootDirectory: "/backend" }),
    start: "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    preDeploy: "alembic upgrade head",
    replicas: { "sfo": 1 },
    deploy: { limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } } },
    domains: ["api.goals.dev.br"],
    env: { ACCESS_TOKEN_EXPIRE_MINUTES: preserve(), ALGORITHM: preserve(), DATABASE_URL: preserve(), FRONTEND_URL: preserve(), GOOGLE_CLIENT_ID: preserve(), GOOGLE_CLIENT_SECRET: preserve(), REFRESH_TOKEN_EXPIRE_DAYS: preserve(), RESEND_KEY: preserve(), SECRET_KEY: preserve() },
  });

  return project("perceptive-adventure", {
    resources: [backendApi, Postgres, postgresVolume],
  });
});
