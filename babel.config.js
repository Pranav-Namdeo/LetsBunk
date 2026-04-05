module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module:react-native-dotenv', {
        moduleName: '@env',
        path: '.env',
        safe: false,
        allowUndefined: false,
      }],
      ['transform-inline-environment-variables', {
        include: ['SERVER_URL'],
      }],
    ],
  };
};
