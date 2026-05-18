import { customModelProvider } from "lib/ai/models";
import { getSession } from "auth/server";
import { userRepository } from "lib/db/repository";

export const GET = async () => {
  const session = await getSession();
  let userCustomModelsInfo: any[] = [];
  
  if (session?.user?.id) {
    const preferences = await userRepository.getPreferences(session.user.id);
    if (preferences?.customProviders) {
      userCustomModelsInfo = preferences.customProviders
        .filter((p) => p.enabled)
        .map((p) => ({
          provider: p.id,
          models: (p.models || []).map((m) => ({
            name: m,
            isToolCallUnsupported: false,
            isImageInputUnsupported: false,
            supportedFileMimeTypes: [], // Defaults
          })),
          hasAPIKey: !!p.apiKey || !!p.baseURL, // Treated as having an API key if configured
          isCustom: true,
          displayName: p.name,
        }));
    }
  }

  const baseModelsInfo = customModelProvider.modelsInfo.map(info => {
     // We can optionally check if there's an API key in preferences.apiKeys[info.provider] but maybe we skip that for the list view API
     return info;
  });

  const allModelsInfo = [...baseModelsInfo, ...userCustomModelsInfo];

  return Response.json(
    allModelsInfo.sort((a, b) => {
      if (a.hasAPIKey && !b.hasAPIKey) return -1;
      if (!a.hasAPIKey && b.hasAPIKey) return 1;
      return 0;
    }),
  );
};
