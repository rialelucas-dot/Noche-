using UnrealBuildTool;

public class UltimoEnPieTarget : TargetRules
{
	public UltimoEnPieTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("UltimoEnPie");
	}
}
