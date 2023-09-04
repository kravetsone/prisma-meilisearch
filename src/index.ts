import { Prisma as RuntimePrisma } from "@prisma/client";
import { Prisma } from "@prisma/client/extension";
import { MeiliSearch } from "meilisearch";
import { SearchParams, SearchResponse } from "meilisearch/dist/types/types";

type TModelNames = keyof typeof RuntimePrisma.ModelName;
type TExtension = ReturnType<
    typeof Prisma.defineExtension<
        NonNullable<unknown>,
        {
            $allModels: {
                search: <
                    T = Record<string, any>,
                    S extends SearchParams | undefined = undefined,
                >(
                    query: string,
                    options?: S,
                    config?: Partial<Request>,
                ) => Promise<SearchResponse<T, S>>;
            };
        }
    >
>;
type TModelTransform = (model: any) => Record<string, unknown>;

export class PrismaMeilisearch {
    extension: TExtension;

    constructor(
        client: MeiliSearch,
        params: {
            models: Partial<Record<TModelNames, TModelTransform | true>>;
        },
    ) {
        this.extension = Prisma.defineExtension({
            name: "prisma-meilisearch",
            model: {
                $allModels: {
                    async search(
                        query: string,
                        options: SearchParams,
                        config?: Partial<Request>,
                    ) {
                        const modelName = RuntimePrisma.getExtensionContext(
                            this,
                        ).$name as TModelNames;

                        if (!Object.keys(params.models).includes(modelName))
                            throw new Error(
                                `The «${modelName}» model does not exist in PrismaMeilisearch`,
                            );

                        return client
                            .index(modelName)
                            .search(query, options, config);
                    },
                },
            },
            query: {
                $allModels: {
                    async create({ model, args, query }) {
                        const data = await query(args);
                        const hook = params.models[model as TModelNames];
                        if (!hook) return data;

                        await client.index(model).addDocuments([
                            hook === true
                                ? {
                                      ...(data as Record<string, unknown>),
                                  }
                                : (hook as TModelTransform)(data),
                        ]);

                        return data;
                    },
                    async update({ model, args, query }) {
                        const data = await query(args);
                        const hook = params.models[model as TModelNames];
                        if (!hook) return data;

                        await client.index(model).updateDocuments([
                            hook === true
                                ? {
                                      ...(data as Record<string, unknown>),
                                  }
                                : (hook as TModelTransform)(data),
                        ]);

                        return data;
                    },
                    async delete({ model, args, query }) {
                        const data = await query(args);
                        const hook = params.models[model as TModelNames];
                        if (!hook) return data;

                        //TODO: add select primaryKey support
                        // @ts-ignore
                        await client.index(model).deleteDocument(data!.id);

                        return data;
                    },
                },
            },
        });
    }
}
