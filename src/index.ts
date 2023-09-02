import { Prisma as RuntimePrisma } from "@prisma/client";
import { Prisma } from "@prisma/client/extension";
import { MeiliSearch } from "meilisearch";

type TModelNames = keyof typeof RuntimePrisma.ModelName;
type TExtension = ReturnType<
    typeof Prisma.defineExtension<
        NonNullable<unknown>,
        {
            $allModels: {
                search: (query: string) => Promise<number[]>;
            };
        }
    >
>;
type TModelTransform = (model: any) => Record<string, unknown>;

const syncOnOperations = ["create", "update", "upsert", "delete"];

export class PrismaMeilisearch {
    private readonly client: MeiliSearch;
    extension: TExtension;
    models: Record<TModelNames, TModelTransform | true>;

    constructor(
        client: MeiliSearch,
        params: { models: Record<TModelNames, TModelTransform | true> },
    ) {
        this.client = client;
        this.models = params.models;

        this.extension = Prisma.defineExtension((prisma) =>
            prisma.$extends({
                name: "prisma-meilisearch",
                model: {
                    $allModels: {
                        async search(query: string) {
                            const modelName = RuntimePrisma.getExtensionContext(
                                this,
                            ).$name as TModelNames;

                            if (!Object.keys(params.models).includes(modelName))
                                throw new Error(
                                    `The «${modelName}» model does not exist in PrismaMeilisearch`,
                                );

                            return client.index(modelName).search(query);
                        },
                    },
                },
                query: {
                    $allModels: {
                        async create({ model, operation, args, query }) {
                            const data = await query(args);
                            const hook = params.models[model as TModelNames];

                            await client.index(model).addDocuments([
                                hook === true
                                    ? {
                                          ...(data as Record<string, unknown>),
                                      }
                                    : (hook as TModelTransform)(data),
                            ]);

                            return data;
                        },
                    },
                },
            }),
        );
    }
}
