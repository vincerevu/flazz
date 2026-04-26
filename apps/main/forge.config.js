export default {
  packagerConfig: {
    name: 'Flazz',
    executableName: process.platform === 'win32' ? 'Flazz' : 'flazz',
    appBundleId: 'com.flazz.app',
    appCategoryType: 'public.app-category.productivity',
    icon: '../../assets/icon', // Electron Forge will add the right extension
    asar: true,
    extraResource: [
      '../../assets',
      '../../packages/core/src/application/assistant/skills'
    ],
    // macOS specific
    ...(process.platform === 'darwin' && {
      osxSign: {
        identity: process.env.APPLE_IDENTITY,
        'hardened-runtime': true,
        entitlements: 'entitlements.plist',
        'entitlements-inherit': 'entitlements.plist',
        'signature-flags': 'library'
      },
      osxNotarize: process.env.APPLE_ID ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID
      } : undefined
    })
  },
  rebuildConfig: {},
  makers: [
    // Windows
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Flazz',
        authors: 'Flazz Team',
        description: 'AI coworker with memory',
        setupIcon: '../../assets/icon.ico',
        loadingGif: '../../assets/loading.gif', // optional
        iconUrl: 'https://raw.githubusercontent.com/vincerevu/flazz/main/assets/icon.ico'
      },
      platforms: ['win32']
    },
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: '../../assets/icon.icns',
        format: 'ULFO',
        name: 'Flazz'
      },
      platforms: ['darwin']
    },
    // Linux - Debian/Ubuntu
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'flazz',
          productName: 'Flazz',
          genericName: 'AI Assistant',
          description: 'Local-first AI coworker with memory',
          categories: ['Office', 'Utility'],
          maintainer: 'Flazz Team',
          homepage: 'https://github.com/vincerevu/flazz',
          icon: '../../assets/icon.png',
          section: 'utils',
          priority: 'optional'
        }
      },
      platforms: ['linux']
    },
    // Linux - Fedora/RHEL
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'flazz',
          productName: 'Flazz',
          genericName: 'AI Assistant',
          description: 'Local-first AI coworker with memory',
          categories: ['Office', 'Utility'],
          homepage: 'https://github.com/vincerevu/flazz',
          icon: '../../assets/icon.png',
          license: 'Apache-2.0'
        }
      },
      platforms: ['linux']
    },
    // Zip for all platforms (portable version)
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32']
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'vincerevu',
          name: 'flazz'
        },
        prerelease: false,
        draft: true
      }
    }
  ]
};
