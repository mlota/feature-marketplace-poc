import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import archiver from 'archiver';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { Builder } from 'xml2js';
import {
	IndexData,
	metadataTypeFolderMappings,
	SalesforcePackageXmlType,
} from './models/marketplace.models';

// Action inputs
const API_VERSION = core.getInput('api-version');
const GITHUB_TOKEN: string = core.getInput('github-token', { required: true });
const TAG_NAME: string = core.getInput('tag-name', { required: true });
const RELEASE_NAME: string = core.getInput('release-name', { required: true });
const RELEASE_VERSION: string = core.getInput('release-version', { required: true });

// Environment variables
const GITHUB_TRIGGERING_ACTOR: string = process.env.GITHUB_TRIGGERING_ACTOR!;
const GITHUB_ACTOR: string = process.env.GITHUB_ACTOR!;
const GITHUB_WORKSPACE: string = process.env.GITHUB_WORKSPACE!;
const INDEX_FILE: string = path.join(GITHUB_WORKSPACE, 'index.json');
const CONTENT_DIR: string = path.join(GITHUB_WORKSPACE, 'content');

const IGNORED_DIRECTORY_CONTENT = [
	'dist',
	'.DS_Store',
	'package.xml',
	'info.json',
];

const errors: string[] = [];
const octokit = github.getOctokit(GITHUB_TOKEN);

/**
 * Read all files from the given folders and their subfolders using fs.readdir's
 * recursive option.
 *
 * @param folderPaths Array of folder paths to read
 * @returns A promise that resolves to an array of file paths
 */
const getFolderStructure = async (folderPaths: string[]) => {
	let allFilePaths: string[] = [];

	for (const folder of folderPaths) {
		try {
			// Read all files and folders recursively in the folder
			const files = await fsPromises.readdir(folder, {
				withFileTypes: false,
				recursive: true,
			});

			// Convert relative paths to absolute paths
			const filePaths = files.map(file => path.resolve(folder, file));
			allFilePaths = allFilePaths.concat(filePaths);
		} catch (ex) {
			captureError(ex, `Error reading folder ${folder}`);
		}
	}

	return allFilePaths;
};

/**
 * Create a zip file of the contents of a specified folder
 * excluding the 'dist' folder.
 *
 * @param sourceDir The path to the folder to zip
 * @param outPath The path to the output zip file
 */
const zipFolder = async (sourceDir: string, outPath: string): Promise<void> => {
	const output = fs.createWriteStream(outPath);
	const archive = archiver('zip', {
		zlib: { level: 9 }, // Sets the compression level
	});

	return new Promise<void>((resolve, reject) => {
		output.on('close', () => {
			console.log(
				`Archive created successfully, total bytes: ${archive.pointer()}`,
			);
			resolve();
		});

		archive.on('error', err => {
			reject(err);
		});

		archive.pipe(output);

		// Append files from the source directory, excluding the 'dist' folder
		archive.glob('**/*', {
			cwd: sourceDir,
			ignore: ['dist/**', 'info.json'],
		});

		archive.finalize();
	});
};

const getSubdirectories = async (directory: string): Promise<string[]> => {
	const entries = await fsPromises.readdir(directory, { withFileTypes: true });
	return entries
		.filter(
			entry =>
				entry.isDirectory() && !IGNORED_DIRECTORY_CONTENT.includes(entry.name),
		)
		.map(entry => path.join(directory, entry.name));
};

const parseFilePaths = (filesPaths: string[]): string[] => {
	const filteredPaths = filesPaths.filter(filePath => {
		const fileName = path.basename(filePath);
		return (
			/\.[^\/]+$/.test(fileName) &&
			!IGNORED_DIRECTORY_CONTENT.some(ignored => filePath.includes(ignored))
		);
	});

	return filteredPaths;
};

const createPackageXmlContent = (
	types: SalesforcePackageXmlType,
	version?: string,
) => {
	let xml: string = '';
	try {
		const builder = new Builder();
		const mappedTypes: Array<{ members: string[]; name: string }> = [];
		const packObj = {
			Package: {
				types: mappedTypes,
				...(version ? { version } : {}),
			},
		};

		// Append new nodes to the Package object
		Object.entries(types).forEach(([name, members]) => {
			mappedTypes.push({
				members,
				name,
			});
		});

		xml = builder
			.buildObject(packObj)
			.replace(
				'<Package>',
				'<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
			)
			.replace(' standalone="yes"', '');
	} catch (ex) {
		captureError(ex, 'Error creating package.xml');
	}

	return xml;
};

/* const createPackageXml = async (featurePath: string): Promise<string> => {
	const folders = await getSubdirectories(featurePath);

	const types: SalesforcePackageXmlType = {};
	for (const folder of folders) {
		const baseName = path.basename(folder);
		if (metadataTypeFolderMappings[baseName]) {
			// Read files and folders (hence using 'entries' convention)
			const entries = await fsPromises.readdir(folder, { withFileTypes: true });
			types[metadataTypeFolderMappings[baseName]] = entries.map(
				entry => path.parse(entry.name).name,
			);
		}
	}

	return Promise.resolve(createPackageXmlContent(types, '62.0'));
}; */

const createPackageXml = async (featurePath: string, destructive = false): Promise<void> => {
	const folders = await getSubdirectories(featurePath);

	const types: SalesforcePackageXmlType = {};
	for (const folder of folders) {
		const baseName = path.basename(folder);
		if (metadataTypeFolderMappings[baseName]) {
			// Read files and folders (hence using 'entries' convention)
			const entries = await fsPromises.readdir(folder, { withFileTypes: true });
			types[metadataTypeFolderMappings[baseName]] = entries
				.filter(entry => !entry.name.endsWith('-meta.xml'))
				.map(entry => path.parse(entry.name).name);
		}
	}

  const packageXml = createPackageXmlContent(
		types,
		!destructive ? API_VERSION : undefined,
	);

  const fileName = destructive ? 'destructiveChanges.xml' : 'package.xml';
  core.info(`${fileName}: ${packageXml}`);
  const packageXmlPath = path.join(featurePath, fileName);
  console.log('package.xml has been written to:', packageXmlPath);
  await fsPromises.writeFile(packageXmlPath, packageXml);
};

const hasPendingChanges = async (): Promise<boolean> => {
	let hasChanges = false;
	let output = '';

	const options = {
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
		},
	};

	try {
		await exec.exec('git', ['status', '--porcelain'], options);
		hasChanges = output.trim().length > 0;
	} catch (ex) {
		captureError(ex, 'Error checking for pending changes');
	}

	return hasChanges;
};

const commit = async () => {
	try {
		// Configure git
		await exec.exec('git', [
			'config',
			'--global',
			'user.name',
			'github-actions[bot]',
		]);
		await exec.exec('git', [
			'config',
			'--global',
			'user.email',
			'github-actions[bot]@users.noreply.github.com',
		]);

		// Add changes
		await exec.exec('git', ['add', '.']);

		// Commit changes
		await exec.exec('git', [
			'commit',
			'-m',
			`[ci]: Automated commit from Marketplace Release Action (triggered by @${GITHUB_ACTOR})`,
		]);

		// Push changes
		await exec.exec('git', ['push']);
	} catch (ex) {
		captureError(ex, 'Error committing changes');
	}
};

const captureError = (ex: unknown, detailedPrefix?: string) => {
	const errMsg = ex instanceof Error ? ex.message : 'Unknown error';
	errors.push(
		detailedPrefix ? `${detailedPrefix}: ${errMsg}` : `Error: ${errMsg}`,
	);
};

const createInstallationZip = async (featurePath: string): Promise<string> => {
  // Create the package.xml file
  await createPackageXml(featurePath);

  // Ensure the dist folder exists
  const distPath = path.join(featurePath, 'dist');
  const basename = path.basename(featurePath);
  await fsPromises.mkdir(distPath, { recursive: true });

  const installZipPath = path.join(featurePath, 'dist', `${basename}-install.zip`);

  // Zip the contents of the feature folder (including package.xml) and save
  // it to the dist folder
  await zipFolder(
    featurePath,
    path.join(featurePath, 'dist', `${basename}-install.zip`),
  );
  console.log('featurePath', featurePath);
  console.log(path.join(featurePath, 'package.xml'));

  let exists = false;
  try {
    await fsPromises.access(path.join(featurePath, 'package.xml'));
    exists = true;
  } catch (ex) {
    exists = false;
  }
  console.log('Does file exist?', exists);

  // Remove the temporary package.xml file
  // await fsPromises.unlink(path.join(featurePath, 'package.xml'));
  const packageXmlPath = path.join(featurePath, 'package.xml');
  try {
    await exec.exec('rm', [packageXmlPath]);
    console.log(`File removed: ${packageXmlPath}`);
  } catch (error) {
    console.error(`Error removing file: ${packageXmlPath}`, error);
  }

  return installZipPath;
};

const createUninstallZip = async (featurePath: string): Promise<string> => {
	// Create the package.xml file
	await createPackageXml(featurePath, true);

	// Ensure the dist folder exists
	const distPath = path.join(featurePath, 'dist');
  const basename = path.basename(featurePath);
	await fsPromises.mkdir(distPath, { recursive: true });

  const uninstallZipPath = path.join(featurePath, 'dist', `${basename}-uninstall.zip`);

	// Zip the contents of the feature folder (including package.xml) and save
	// it to the dist folder
	/* await zipFolder(
    featurePath,
    path.join(featurePath, 'dist', 'install.zip'),
  ); */

	// Create a zip file containing just the package.xml and destructiveChanges.xml files
	const output = fs.createWriteStream(path.join(distPath, `${basename}-uninstall.zip`));
	const archive = archiver('zip', {
		zlib: { level: 9 }, // Sets the compression level
	});

	return new Promise<string>((resolve, reject) => {
		output.on('close', () => {
			console.log(
				`Archive created successfully, total bytes: ${archive.pointer()}`,
			);
			resolve(uninstallZipPath);
		});

		archive.on('error', err => {
			reject(err);
		});

		archive.pipe(output);

		// Append the package.xml and destructiveChanges.xml files to the archive
		archive.file(path.join(featurePath, 'package.xml'), {
			name: 'package.xml',
		});
		archive.file(path.join(featurePath, 'destructiveChanges.xml'), {
			name: 'destructiveChanges.xml',
		});

		archive.finalize();
	}).then(async () => {
		// Remove the temporary xml files
		// await fsPromises.unlink(path.join(featurePath, 'package.xml'));
		// await fsPromises.unlink(path.join(featurePath, 'destructiveChanges.xml'));
		const packageXmlPath = path.join(featurePath, 'package.xml');
		try {
			await exec.exec('rm', [packageXmlPath]);
			console.log(`File removed: ${packageXmlPath}`);
		} catch (error) {
			console.error(`Error removing file: ${packageXmlPath}`, error);
		}

		return uninstallZipPath;
	});

	/* // Remove the temporary xml files
	await fsPromises.unlink(path.join(featurePath, 'package.xml'));
	await fsPromises.unlink(path.join(featurePath, 'destructiveChanges.xml')); */
};

const run = async (contentDir: string, indexFile: string): Promise<void> => {
	// Get a list of each of the child folders under features
	const features = await fsPromises.readdir(contentDir);

	// Create an object to store the index data as we iterate through each feature
	const info: IndexData = {
		features: [],
	};

  const installZipPaths: string[] = [];
  const uninstallZipPaths: string[] = [];

	// features.forEach(async folder => {
	for (const folder of features) {
		const featurePath = path.join(contentDir, folder);
		// Read the existing info.json file. We'll need to update this with the files
		const featureInfo = await fsPromises.readFile(
			path.join(featurePath, 'info.json'),
			'utf8',
		);
		const parsed = JSON.parse(featureInfo);
		const files = await getFolderStructure([featurePath]);

		info.features.push({
			id: parsed.id,
			name: folder,
			label: parsed.label,
			description: parsed.description,
			version: parsed.version,
			files: parseFilePaths(files).map(file =>
				path.relative(featurePath, file),
			),
		});

		/* // Create the package.xml file
		await createPackageXml(featurePath);

		// Ensure the dist folder exists
		const distPath = path.join(featurePath, 'dist');
		await fsPromises.mkdir(distPath, { recursive: true });

		// Zip the contents of the feature folder (including package.xml) and save
		// it to the dist folder
		await zipFolder(
			featurePath,
			path.join(featurePath, 'dist', `${folder}.zip`),
		); */

    const installZipPath = await createInstallationZip(featurePath);
    const uninstallZipPath = await createUninstallZip(featurePath);

    installZipPaths.push(installZipPath);
    uninstallZipPaths.push(uninstallZipPath);
	}

	core.info('index.json: ' + JSON.stringify(info, null, 2));



  const response = await octokit.rest.repos.createRelease({
		...github.context.repo,
		tag_name: RELEASE_VERSION,
		name: RELEASE_VERSION,
		body: `Automated release for version ${RELEASE_VERSION}`,
		// body: 'Release created by the Marketplace Release Action',
	});

	const releaseId = response.data.id;
	const releaseUrl = response.data.html_url;
	core.info(`Release created: ${releaseUrl}`);
	core.info(`Release ID: ${releaseId}`);

  for (const installZipPath of installZipPaths) {
		const absolutePath = path.resolve(installZipPath);
		const fileName = path.basename(absolutePath);
		const fileData = await fsPromises.readFile(absolutePath, 'utf8');

		console.log(`Attaching file: ${fileName}`);
		await octokit.rest.repos.uploadReleaseAsset({
			owner: github.context.repo.owner,
			repo: github.context.repo.repo,
			release_id: releaseId,
			name: fileName,
			data: fileData,
		});
	}




	// Write the updated index.json file
	await fsPromises.writeFile(indexFile, JSON.stringify(info, null, 2));

	const hasChanges = await hasPendingChanges();
	if (hasChanges) {
		// Commit the changes generated in the action to the repository
		await commit();
	} else {
		core.info('No changes to commit');
	}
};

(async () => {
  core.info('GITHUB_TRIGGERING_ACTOR: ' + GITHUB_TRIGGERING_ACTOR);
  core.info('GITHUB_ACTOR: ' + GITHUB_ACTOR);
  core.info('GITHUB_WORKSPACE: ' + GITHUB_WORKSPACE);
  core.info('INDEX_FILE: ' + INDEX_FILE);
  core.info('CONTENT_DIR: ' + CONTENT_DIR);
  core.info('API_VERSION: ' + API_VERSION);
  core.info('GITHUB_TOKEN: ' + GITHUB_TOKEN);
  core.info('TAG_NAME: ' + TAG_NAME);
  core.info('RELEASE_NAME: ' + RELEASE_NAME);
  core.info('RELEASE_VERSION: ' + RELEASE_VERSION);

	await run(CONTENT_DIR, INDEX_FILE);
	if (errors.length) {
		core.setFailed(errors.join('\n'));
	}
})();
