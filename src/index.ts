import { createDb } from "./db";

type City = { uuid: string; name: string };
type Division = { uuid: string; name: string; cityUuid: string };
type Position = { uuid: string; name: string };
type Employee = {
  uuid: string;
  firstName: string;
  lastName: string;
  divisionUuid: string;
  cityUuid: string;
  positionUuid: string;
};

type DbType = "employee" | "city" | "position" | "division";

export interface IHRApp {
  employeeWithCityList: () => Promise<{ firstName: string; city: string }[]>;
  employeeWithPositionList: () => Promise<{
    firstName: string;
    position: string;
    division: string;
  }[]>;
  update: (args: {
    entity: "employee" | "city" | "position" | "division";
    data: object;
  }) => Promise<void>;
}

class Repo {
  constructor(private readonly db: ReturnType<typeof createDb>) {}

  async all<T>(type: DbType): Promise<T[]> {
    const res = await this.db.query({ type, where: {} as any });
    return res.items.map((x) => x.data as T);
  }
}

class RefCache {
  private cache = new Map<DbType, Map<string, string>>();
  private inFlight = new Map<DbType, Promise<Map<string, string>>>();

  constructor(private readonly repo: Repo) {}

  cityMap(): Promise<Map<string, string>> {
    return this.getMap<City>("city", (x) => x.uuid, (x) => x.name);
  }
  positionMap(): Promise<Map<string, string>> {
    return this.getMap<Position>("position", (x) => x.uuid, (x) => x.name);
  }
  divisionMap(): Promise<Map<string, string>> {
    return this.getMap<Division>("division", (x) => x.uuid, (x) => x.name);
  }

  private getMap<T>(
    type: DbType,
    key: (x: T) => string,
    value: (x: T) => string
  ): Promise<Map<string, string>> {
    const ready = this.cache.get(type);
    if (ready) return Promise.resolve(ready);

    const inflight = this.inFlight.get(type);
    if (inflight) return inflight;

    const p = (async () => {
      const items = await this.repo.all<T>(type);
      const map = new Map<string, string>();
      for (const it of items) map.set(key(it), value(it));
      this.cache.set(type, map);
      this.inFlight.delete(type);
      return map;
    })().catch((e) => {
      this.inFlight.delete(type);
      throw e;
    });

    this.inFlight.set(type, p);
    return p;
  }
}

export const createHRApp = (): IHRApp => {
  const db = createDb();
  const repo = new Repo(db);
  const refs = new RefCache(repo);

  return {
    employeeWithCityList: async () => {
      const [employees, cities] = await Promise.all([
        repo.all<Employee>("employee"),
        refs.cityMap(),
      ]);

      return employees.map((e) => ({
        firstName: e.firstName,
        city: cities.get(e.cityUuid) ?? "",
      }));
    },

    employeeWithPositionList: async () => {
      const [employees, pos, div] = await Promise.all([
        repo.all<Employee>("employee"),
        refs.positionMap(),
        refs.divisionMap(),
      ]);

      return employees.map((e) => ({
        firstName: e.firstName,
        position: pos.get(e.positionUuid) ?? "",
        division: div.get(e.divisionUuid) ?? "",
      }));
    },

    update: async (_args) => {
      // по заданию не нужно
    },
  };
};
