import 'package:flutter_test/flutter_test.dart';

import 'package:noctune/src/core/api/noctune_api.dart';
import 'package:noctune/src/core/models/noctune_models.dart';
import 'package:noctune/src/app/noctune_app.dart';

void main() {
  testWidgets('Noctune mobile shell renders', (WidgetTester tester) async {
    await tester.pumpWidget(NoctuneApp(api: _FakeNoctuneApi()));
    await tester.pump();

    expect(find.text('Noctune mobile'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Library'), findsOneWidget);
    expect(find.text('Search'), findsOneWidget);
    expect(find.text('Queue'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
  });
}

class _FakeNoctuneApi extends NoctuneApi {
  _FakeNoctuneApi() : super(baseUrl: 'http://localhost:3131');

  @override
  Future<HomePayload> home() async {
    return const HomePayload(
      playlists: [],
      recentTracks: [],
      newReleases: [],
    );
  }
}
