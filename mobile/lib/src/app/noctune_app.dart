import 'package:flutter/material.dart';
import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/state/player_controller.dart';
import 'package:noctune/src/features/shell/noctune_shell.dart';
import 'package:noctune/src/shared/theme/noctune_theme.dart';

class NoctuneApp extends StatefulWidget {
  const NoctuneApp({this.api, super.key});

  final NoctuneApi? api;

  @override
  State<NoctuneApp> createState() => _NoctuneAppState();
}

class _NoctuneAppState extends State<NoctuneApp> {
  late NoctuneApi _api;
  late PlayerController _player;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? NoctuneApi();
    _player = PlayerController(api: _api);
  }

  @override
  void dispose() {
    _player.dispose();
    _api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PlayerScope(
      controller: _player,
      child: MaterialApp(
        title: 'Noctune',
        debugShowCheckedModeBanner: false,
        theme: buildNoctuneTheme(),
        home: NoctuneShell(
          api: _api,
          onApiConfigChanged: _setApiConfig,
        ),
      ),
    );
  }

  void _setApiConfig(String baseUrl, [String apiKey = '']) {
    final nextApi = NoctuneApi(baseUrl: baseUrl, apiKey: apiKey);
    final nextPlayer = PlayerController(api: nextApi);
    setState(() {
      _player.dispose();
      _api.close();
      _api = nextApi;
      _player = nextPlayer;
    });
  }
}
