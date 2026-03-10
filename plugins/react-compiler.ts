import { plugin } from "bun";
import { transformSync } from "@babel/core";
import ReactCompilerPlugin from "babel-plugin-react-compiler";

plugin({
  name: "react-compiler",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();

      const result = transformSync(source, {
        filename: args.path,
        plugins: [
          [ReactCompilerPlugin, {}],
          ["@babel/plugin-syntax-typescript", { isTSX: true }],
          "@babel/plugin-syntax-jsx",
        ],
        configFile: false,
        babelrc: false,
      });

      return {
        contents: result?.code ?? source,
        loader: "tsx",
      };
    });
  },
});
