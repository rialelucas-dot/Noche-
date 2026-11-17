using UnrealBuildTool;

public class UltimoEnPieEditorTarget : TargetRules
{
	public UltimoEnPieEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("UltimoEnPie");
	}
}
