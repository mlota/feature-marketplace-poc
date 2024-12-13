export interface FileMetadata {
	path: string;
	type?: string;
}

export interface Feature {
	id: string;
	name: string;
	label: string;
	description: string;
	version: string;
	files: string[];
	installZipFilePath: string;
	uninstallZipFilePath: string;
}

export interface IndexData {
	features: Feature[];
}

export type SalesforceMetadataType =
	| 'ApexClass'
	| 'ApexComponent'
	| 'ApexPage'
	| 'ApexTrigger'
	| 'AssignmentRules'
	| 'AuraDefinitionBundle'
	| 'AuthProvider'
	| 'AutoResponseRules'
	| 'Certificate'
	| 'ChatterExtension'
	| 'CleanDataService'
	| 'Community'
	| 'CompactLayout'
	| 'ConnectedApp'
	| 'ContentAsset'
	| 'CorsWhitelistOrigin'
	| 'CustomApplication'
	| 'CustomApplicationComponent'
	| 'CustomFeedFilter'
	| 'CustomField'
	| 'CustomLabels'
	| 'CustomMetadata'
	| 'CustomObject'
	| 'CustomObjectTranslation'
	| 'CustomPageWebLink'
	| 'CustomPermission'
	| 'CustomSite'
	| 'CustomTab'
	| 'Dashboard'
	| 'DataCategoryGroup'
	| 'Document'
	| 'DuplicateRule'
	| 'EmailTemplate'
	| 'EmbeddedServiceBranding'
	| 'EmbeddedServiceConfig'
	| 'EmbeddedServiceFlowConfig'
	| 'EmbeddedServiceLiveAgent'
	| 'EventDelivery'
	| 'EventSubscription'
	| 'ExternalServiceRegistration'
	| 'FieldSet'
	| 'FlexiPage'
	| 'Flow'
	| 'FlowCategory'
	| 'FlowDefinition'
	| 'GlobalValueSet'
	| 'GlobalValueSetTranslation'
	| 'HomePageComponent'
	| 'HomePageLayout'
	| 'InstalledPackage'
	| 'KeywordList'
	| 'Layout'
	| 'LightningBolt'
	| 'LightningComponentBundle'
	| 'LightningExperienceTheme'
	| 'LightningMessageChannel'
	| 'LightningOnboardingConfig'
	| 'ListView'
	| 'LiveChatAgentConfig'
	| 'LiveChatButton'
	| 'LiveChatDeployment'
	| 'LiveChatSensitiveDataRule'
	| 'ManagedTopics'
	| 'MatchingRule'
	| 'MilestoneType'
	| 'ModerationRule'
	| 'MyDomainDiscoverableLogin'
	| 'NamedCredential'
	| 'Network'
	| 'PathAssistant'
	| 'PermissionSet'
	| 'PermissionSetGroup'
	| 'PlatformEventChannel'
	| 'PlatformEventChannelMember'
	| 'Portal'
	| 'PostTemplate'
	| 'Profile'
	| 'Queue'
	| 'QuickAction'
	| 'RecommendationStrategy'
	| 'RecordActionDeployment'
	| 'RecordType'
	| 'RemoteSiteSetting'
	| 'Report'
	| 'ReportType'
	| 'Role'
	| 'SamlSsoConfig'
	| 'Scontrol'
	| 'ServiceChannel'
	| 'ServicePresenceStatus'
	| 'SharingRules'
	| 'SharingSet'
	| 'SiteDotCom'
	| 'Skill'
	| 'StandardValueSet'
	| 'StandardValueSetTranslation'
	| 'StaticResource'
	| 'Territory'
	| 'Territory2'
	| 'Territory2Model'
	| 'Territory2Rule'
	| 'Territory2Type'
	| 'TopicsForObjects'
	| 'TransactionSecurityPolicy'
	| 'Translations'
	| 'UserCriteria'
	| 'ValidationRule'
	| 'WebLink'
	| 'Workflow';

export const metadataTypeFolderMappings: Record<
	string,
	SalesforceMetadataType
> = {
	application: 'CustomApplication',
	aura: 'AuraDefinitionBundle',
	classes: 'ApexClass',
	components: 'ApexComponent',
	contentAssets: 'ContentAsset',
	customPermissions: 'CustomPermission',
	flexiPages: 'FlexiPage',
	globalValueSets: 'GlobalValueSet',
	homePageComponents: 'HomePageComponent',
	labels: 'CustomLabels',
	layouts: 'Layout',
	lwc: 'LightningComponentBundle',
	messageChannels: 'LightningMessageChannel',
	objects: 'CustomObject',
	pages: 'ApexPage',
	permissionSetGroups: 'PermissionSetGroup',
	quickActions: 'QuickAction',
	staticResources: 'StaticResource',
	tabs: 'CustomTab',
	triggers: 'ApexTrigger',
	workflows: 'Workflow',
};

export type SalesforcePackageXmlType = {
	[K in keyof typeof metadataTypeFolderMappings]: string[];
};
